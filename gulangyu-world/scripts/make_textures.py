from PIL import Image,ImageFilter
import numpy as np,pathlib
R=pathlib.Path(__file__).resolve().parents[1]/'delivery'/'textures';R.mkdir(exist_ok=True)
rng=np.random.default_rng(47);N=1024;y,x=np.mgrid[0:N,0:N];noise=rng.normal(0,1,(N,N))
def smooth(n):
 a=Image.fromarray(np.uint8(np.clip(128+noise*24,0,255))).filter(ImageFilter.GaussianBlur(n));return (np.array(a).astype(float)-128)/24
coarse=smooth(20);fine=smooth(2)
def save(name,rgb,h,rough):
 Image.fromarray(np.uint8(np.clip(rgb*255,0,255))).save(R/f'{name}_base.png')
 gy,gx=np.gradient(h);normal=np.stack([-gx*6,-gy*6,np.ones_like(gx)],-1);normal/=np.linalg.norm(normal,axis=-1)[...,None]
 Image.fromarray(np.uint8((normal*.5+.5)*255)).save(R/f'{name}_normal.png')
 Image.fromarray(np.uint8(np.clip(rough*255,0,255))).save(R/f'{name}_rough.png')
# All original synthesized seamless materials; no photography used as texture.
for name,col in [('plaster',(0.79,.73,.59)),('ivory',(.91,.87,.73)),('granite',(.51,.50,.45)),('earth',(.24,.29,.17))]:
 h=noise*.018+fine*.03+coarse*.6
 if name=='granite':h+=((noise>1.3)*.08)
 rgb=np.array(col)[None,None,:]*(1+fine[...,None]*.3+coarse[...,None]*.8+noise[...,None]*.055)
 save(name,rgb,h,np.ones((N,N))*.85+fine*.04)
for name,col,rows,cols,mortar in [('brick',(.58,.27,.17),16,6,.035),('paving',(.49,.48,.42),12,8,.04),('roof',(.67,.27,.13),16,12,.022)]:
 yy=y/(N/rows);xx=x/(N/cols)+(np.floor(yy)%2)*.5;fy=yy%1;fx=xx%1
 joints=(fx<mortar)|(fy<mortar)
 val=rng.uniform(.82,1.12,(rows+1,cols+2))[np.floor(yy).astype(int),np.floor(xx).astype(int)]
 h=np.where(joints,0,.6)+noise*.015
 if name=='roof':h+=np.sin(fx*np.pi)*.8+(1-fy)*.1
 rgb=np.array(col)[None,None,:]*(val[...,None]+noise[...,None]*.035+fine[...,None]*.15)
 rgb[joints]=(.39,.35,.28) if name!='roof' else (.24,.12,.065)
 save(name,rgb,h,np.ones((N,N))*.8)
print('Original PBR textures:',len(list(R.glob('*.png'))))
from scipy.ndimage import gaussian_filter
streak=gaussian_filter(rng.normal(0,1,(N,N)),(70,22));streak=(streak-streak.min())/(streak.max()-streak.min());patch=gaussian_filter(rng.normal(0,1,(N,N)),(16,16));patch=patch/max(abs(patch.min()),patch.max());stain=np.clip(streak*1.6-.55,0,1)
rgb=np.array((.56,.49,.37))[None,None,:]*(.8+stain[...,None]*.22+patch[...,None]*.22+noise[...,None]*.055)
save('rock',rgb,noise*.008+fine*.04,np.ones((N,N))*.94)
