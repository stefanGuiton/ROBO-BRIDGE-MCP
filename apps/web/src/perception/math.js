const EPS = 1e-9;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function add3(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
export function sub3(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
export function scale3(a,s){return[a[0]*s,a[1]*s,a[2]*s];}
export function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
export function cross3(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
export function length3(a){return Math.hypot(a[0],a[1],a[2]);}
export function normalize3(a){const len=length3(a);return len<EPS?[0,0,0]:scale3(a,1/len);}
export function mat4Multiply(a,b){
  const out=new Array(16).fill(0);
  for(let r=0;r<4;r+=1)for(let c=0;c<4;c+=1)for(let k=0;k<4;k+=1)out[r*4+c]+=a[r*4+k]*b[k*4+c];
  return out;
}
export function mat4Vec4(m,v){return[
  m[0]*v[0]+m[1]*v[1]+m[2]*v[2]+m[3]*v[3],
  m[4]*v[0]+m[5]*v[1]+m[6]*v[2]+m[7]*v[3],
  m[8]*v[0]+m[9]*v[1]+m[10]*v[2]+m[11]*v[3],
  m[12]*v[0]+m[13]*v[1]+m[14]*v[2]+m[15]*v[3]
];}
export function lookAt(eye,target,up=[0,1,0]){
  const z=normalize3(sub3(eye,target));
  let x=normalize3(cross3(up,z));
  if(length3(x)<EPS)x=[1,0,0];
  const y=cross3(z,x);
  return[
    x[0],x[1],x[2],-dot3(x,eye),
    y[0],y[1],y[2],-dot3(y,eye),
    z[0],z[1],z[2],-dot3(z,eye),
    0,0,0,1
  ];
}
export function orthographic(left,right,bottom,top,near,far){
  return[
    2/(right-left),0,0,-(right+left)/(right-left),
    0,2/(top-bottom),0,-(top+bottom)/(top-bottom),
    0,0,-2/(far-near),-(far+near)/(far-near),
    0,0,0,1
  ];
}
export function perspective(fovYDeg,aspect,near,far){
  const f=1/Math.tan((fovYDeg*Math.PI/180)/2), nf=1/(near-far);
  return[
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,(far+near)*nf,2*far*near*nf,
    0,0,-1,0
  ];
}
export function yawPoint(point,yawDeg){
  const a=yawDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return[point[0]*c-point[1]*s,point[0]*s+point[1]*c,point[2]];
}
