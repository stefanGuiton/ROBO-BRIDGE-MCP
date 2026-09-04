#!/usr/bin/env python3
"""Offline reference compiler for the ROBO BRIDGE block terrain contract.

This mirrors the browser algorithm and is used for deterministic verification.
"""
from __future__ import annotations
import argparse, json, math, struct, time, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
import trimesh

EMPTY = np.int16(-32768)

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def load_source(path: Path):
    scene = trimesh.load(path, force='scene')
    if not scene.geometry:
        raise RuntimeError('GLB has no geometry')
    # This prototype expects one heightfield mesh. Merge transformed geometry if needed.
    meshes=[]
    for name, geom in scene.geometry.items():
        meshes.append(geom.copy())
    if len(meshes) != 1:
        mesh = trimesh.util.concatenate(meshes)
    else:
        mesh = meshes[0]
    if not hasattr(mesh.visual, 'uv') or mesh.visual.uv is None:
        raise RuntimeError('Source mesh has no TEXCOORD_0 UV data')
    material = mesh.visual.material
    image = getattr(material, 'baseColorTexture', None)
    if image is None:
        raise RuntimeError('Source material has no baseColorTexture')
    image = image.convert('RGB')
    return mesh, image

def barycentric_xz(p, tri_xz, eps=1e-10):
    x,z = p
    x0,z0 = tri_xz[0]; x1,z1 = tri_xz[1]; x2,z2 = tri_xz[2]
    den = (z1-z2)*(x0-x2) + (x2-x1)*(z0-z2)
    if abs(den) < eps:
        return None
    w0 = ((z1-z2)*(x-x2) + (x2-x1)*(z-z2)) / den
    w1 = ((z2-z0)*(x-x2) + (x0-x2)*(z-z2)) / den
    w2 = 1.0 - w0 - w1
    if w0 >= -1e-8 and w1 >= -1e-8 and w2 >= -1e-8:
        return w0,w1,w2
    return None

def bilinear_rgb(arr, uv):
    h,w,_ = arr.shape
    u = float(uv[0]) % 1.0
    v = float(uv[1]) % 1.0
    # glTF UV origin is bottom-left. PIL origin is top-left.
    x = u * (w-1)
    y = (1.0-v) * (h-1)
    x0=int(math.floor(x)); y0=int(math.floor(y))
    x1=min(x0+1,w-1); y1=min(y0+1,h-1)
    tx=x-x0; ty=y-y0
    c00=arr[y0,x0].astype(np.float64); c10=arr[y0,x1].astype(np.float64)
    c01=arr[y1,x0].astype(np.float64); c11=arr[y1,x1].astype(np.float64)
    c0=c00*(1-tx)+c10*tx; c1=c01*(1-tx)+c11*tx
    return np.clip(np.rint(c0*(1-ty)+c1*ty),0,255).astype(np.uint8)

def compile_grid(mesh, image, block_width, block_height, origin_x=None, origin_z=None):
    verts=np.asarray(mesh.vertices, dtype=np.float64)
    faces=np.asarray(mesh.faces, dtype=np.int32)
    uvs=np.asarray(mesh.visual.uv, dtype=np.float64)
    bmin=verts.min(axis=0); bmax=verts.max(axis=0)
    ox = float(bmin[0]) if origin_x is None else float(origin_x)
    oz = float(bmin[2]) if origin_z is None else float(origin_z)
    cols=max(1,int(math.ceil((bmax[0]-ox)/block_width)))
    rows=max(1,int(math.ceil((bmax[2]-oz)/block_width)))
    # Candidate triangle index for each grid cell.
    bins=[[] for _ in range(rows*cols)]
    tri_v=verts[faces]
    for fi,t in enumerate(tri_v):
        xmin,xmax=t[:,0].min(),t[:,0].max(); zmin,zmax=t[:,2].min(),t[:,2].max()
        c0=max(0,int(math.floor((xmin-ox)/block_width)))
        c1=min(cols-1,int(math.floor((xmax-ox)/block_width)))
        r0=max(0,int(math.floor((zmin-oz)/block_width)))
        r1=min(rows-1,int(math.floor((zmax-oz)/block_width)))
        if c0>c1 or r0>r1: continue
        for r in range(r0,r1+1):
            base=r*cols
            for c in range(c0,c1+1): bins[base+c].append(fi)
    heights=np.full((rows,cols), EMPTY, dtype=np.int16)
    colors=np.zeros((rows,cols,3), dtype=np.uint8)
    hit_uv=np.full((rows,cols,2), np.nan, dtype=np.float32)
    arr=np.asarray(image)
    base_y=float(bmin[1])
    hit_count=0
    for r in range(rows):
        z=oz+(r+0.5)*block_width
        for c in range(cols):
            x=ox+(c+0.5)*block_width
            best_y=-1e30; best_uv=None
            for fi in bins[r*cols+c]:
                f=faces[fi]; t=verts[f]
                bc=barycentric_xz((x,z), t[:,[0,2]])
                if bc is None: continue
                w0,w1,w2=bc
                y=w0*t[0,1]+w1*t[1,1]+w2*t[2,1]
                if y>best_y:
                    tuv=uvs[f]
                    best_uv=w0*tuv[0]+w1*tuv[1]+w2*tuv[2]
                    best_y=y
            if best_uv is None: continue
            layer=int(round((best_y-base_y)/block_height))
            layer=max(-32767,min(32767,layer))
            heights[r,c]=np.int16(layer)
            colors[r,c]=bilinear_rgb(arr,best_uv)
            hit_uv[r,c]=best_uv
            hit_count+=1
    return {
        'heights':heights,'colors':colors,'uv':hit_uv,
        'rows':rows,'cols':cols,'origin_x':ox,'origin_z':oz,
        'base_y':base_y,'block_width':block_width,'block_height':block_height,
        'bounds_min':bmin,'bounds_max':bmax,'hit_count':hit_count,
    }

def add_height_ao(comp, strength=0.24):
    """Cheap reference AO only. Cycles bake remains the production path."""
    h=comp['heights'].astype(np.int32)
    valid=h!=int(EMPTY)
    occ=np.zeros_like(h,dtype=np.float32)
    for dr,dc in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
        sh=np.roll(np.roll(h,dr,axis=0),dc,axis=1)
        sv=np.roll(np.roll(valid,dr,axis=0),dc,axis=1)
        d=np.maximum(sh-h,0)
        occ += np.where(valid & sv, np.minimum(d,4)/4.0, 0)
    occ=np.clip(occ/8.0,0,1)
    factor=1.0-strength*occ
    col=comp['colors'].astype(np.float32)*factor[...,None]
    comp['preview_colors']=np.clip(np.rint(col),0,255).astype(np.uint8)
    return comp

def count_walls(comp):
    h=comp['heights']; rows,cols=h.shape; empty=int(EMPTY)
    walls=0
    for r in range(rows):
        for c in range(cols):
            cur=int(h[r,c])
            if cur==empty: continue
            for dr,dc in [(-1,0),(1,0),(0,-1),(0,1)]:
                rr=r+dr; cc=c+dc
                nb=empty if rr<0 or rr>=rows or cc<0 or cc>=cols else int(h[rr,cc])
                if nb==empty or cur>nb: walls+=1
    return walls

def export_binary(comp, out_dir:Path, source_bytes:bytes, chunk_size=32):
    out_dir.mkdir(parents=True, exist_ok=True)
    h=comp['heights']; col=comp['colors']; rows,cols=h.shape
    rec=bytearray(rows*cols*6); off=0
    for r in range(rows):
        for c in range(cols):
            layer=int(h[r,c]); flags=1 if layer==int(EMPTY) else 0
            rgb=(0,0,0) if flags else map(int,col[r,c])
            rr,gg,bb=rgb
            struct.pack_into('<hBBBB',rec,off,layer,rr,gg,bb,flags); off+=6
    data=bytes(rec)
    (out_dir/'terrain.cells.bin').write_bytes(data)
    meta={
      'formatVersion':1,'rows':rows,'cols':cols,
      'blockWidth':comp['block_width'],'blockHeight':comp['block_height'],
      'gridOrigin':[comp['origin_x'],comp['origin_z']], 'baseHeight':comp['base_y'],
      'chunkSize':chunk_size,'colorSpace':'sRGB','recordBytes':6,
      'sourceSha256':sha256_bytes(source_bytes),'cellDataSha256':sha256_bytes(data),
      'occupiedCells':int(np.count_nonzero(h!=EMPTY)), 'emptyCells':int(np.count_nonzero(h==EMPTY)),
    }
    (out_dir/'terrain.meta.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
    return meta,data

def build_preview_mesh(comp, use_preview_color=True):
    h=comp['heights']; colors=comp.get('preview_colors',comp['colors']) if use_preview_color else comp['colors']
    rows,cols=h.shape; bw=comp['block_width']; bh=comp['block_height']; ox=comp['origin_x']; oz=comp['origin_z']; by=comp['base_y']; empty=int(EMPTY)
    vertices=[]; faces=[]; face_cols=[]
    def quad(vs, color):
        i=len(vertices); vertices.extend(vs); faces.extend([[i,i+1,i+2],[i,i+2,i+3]]); face_cols.extend([color,color])
    for r in range(rows):
        z0=oz+r*bw; z1=z0+bw
        for c in range(cols):
            cur=int(h[r,c]);
            if cur==empty: continue
            x0=ox+c*bw; x1=x0+bw; y=by+cur*bh
            color=colors[r,c].tolist()+[255]
            quad([[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]],color)
            # side colors are slightly darker for form.
            side=(np.array(color[:3],dtype=np.float32)*0.78).astype(np.uint8).tolist()+[255]
            for dr,dc,side_id in [(-1,0,0),(1,0,1),(0,-1,2),(0,1,3)]:
                rr=r+dr; cc=c+dc
                nb=empty if rr<0 or rr>=rows or cc<0 or cc>=cols else int(h[rr,cc])
                if nb!=empty and cur<=nb: continue
                low=by if nb==empty else by+nb*bh
                if y<=low+1e-12: continue
                if side_id==0: quad([[x1,low,z0],[x0,low,z0],[x0,y,z0],[x1,y,z0]],side)
                elif side_id==1: quad([[x0,low,z1],[x1,low,z1],[x1,y,z1],[x0,y,z1]],side)
                elif side_id==2: quad([[x0,low,z0],[x0,low,z1],[x0,y,z1],[x0,y,z0]],side)
                else: quad([[x1,low,z1],[x1,low,z0],[x1,y,z0],[x1,y,z1]],side)
    mesh=trimesh.Trimesh(vertices=np.asarray(vertices), faces=np.asarray(faces), process=False)
    # Per-face colors supported by trimesh export to glTF.
    mesh.visual.face_colors=np.asarray(face_cols,dtype=np.uint8)
    return mesh

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('input',type=Path)
    ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--block-width',type=float,default=0.02)
    ap.add_argument('--block-height',type=float,default=0.0125)
    ap.add_argument('--chunk-size',type=int,default=32)
    args=ap.parse_args()
    t0=time.perf_counter(); source=args.input.read_bytes(); mesh,img=load_source(args.input); t1=time.perf_counter()
    comp=compile_grid(mesh,img,args.block_width,args.block_height); t2=time.perf_counter(); add_height_ao(comp); t3=time.perf_counter()
    walls=count_walls(comp)
    meta,data=export_binary(comp,args.out,source,args.chunk_size); t4=time.perf_counter()
    preview=build_preview_mesh(comp); preview.export(args.out/'terrain.preview.glb'); t5=time.perf_counter()
    report={**meta,
      'sourceVertices':int(len(mesh.vertices)),'sourceTriangles':int(len(mesh.faces)),
      'gridCells':int(comp['rows']*comp['cols']),'topCaps':int(comp['hit_count']),
      'sideWalls':int(walls),'estimatedTerrainTriangles':int(comp['hit_count']*2+walls*2),
      'chunksX':int(math.ceil(comp['cols']/args.chunk_size)), 'chunksZ':int(math.ceil(comp['rows']/args.chunk_size)),
      'totalChunks':int(math.ceil(comp['cols']/args.chunk_size)*math.ceil(comp['rows']/args.chunk_size)),
      'timingSeconds':{'load':t1-t0,'compile':t2-t1,'previewAO':t3-t2,'export':t4-t3,'previewGLB':t5-t4,'total':t5-t0},
      'previewGlbBytes':int((args.out/'terrain.preview.glb').stat().st_size),
    }
    (args.out/'compile_report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report,indent=2))
if __name__=='__main__': main()
