from pathlib import Path
import base64,gzip,re
root=Path(__file__).resolve().parent
parts=[]
for p in sorted((root/'chunks').glob('demo_*.js')):
    text=p.read_text()
    m=re.search(r"push\('([A-Za-z0-9+/=]+)'\)",text)
    if not m: raise RuntimeError(f"Invalid chunk: {p}")
    parts.append(m.group(1))
data=gzip.decompress(base64.b64decode(''.join(parts)))
out=root/'LOGO_ROBO_REAL_GRIPPER_GRID_DEMO.html'
out.write_bytes(data)
print(out)
