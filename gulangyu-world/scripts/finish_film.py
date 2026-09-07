"""Compose the Blender camera renders with restrained titles and an original ambient score."""
from PIL import Image,ImageDraw,ImageFont
import numpy as np
from scipy.signal import butter,sosfilt
import pathlib,subprocess,wave,json
R=pathlib.Path(__file__).resolve().parents[1];A=R/'render'/'graphics';A.mkdir(parents=True,exist_ok=True);D=R/'delivery'
W,H=1920,1080
cn='/System/Library/Fonts/Supplemental/Songti.ttc';en='/System/Library/Fonts/Avenir Next.ttc'
def font(path,size):return ImageFont.truetype(path,size)
titles=[('全岛 · 海上花园','01 / ISLAND ARRIVAL'),('日光岩 · 登临海天','02 / SUNLIGHT ROCK'),('八卦楼 · 红顶回廊','03 / BAGUA MANSION'),('菽庄花园 · 借海为园','04 / SHUZHUANG GARDEN'),('万国建筑 · 屋檐之间','05 / HISTORIC ARCHITECTURE'),('龙头路 · 步入街巷','06 / LONGTOU LANE')]
for i,(title,subtitle) in enumerate(titles):
 im=Image.new('RGBA',(W,H));a=np.zeros((H,W,4),dtype=np.uint8)
 for y in range(790,H):a[y,:,3]=int(145*((y-790)/(H-790))**1.3)
 im=Image.fromarray(a);d=ImageDraw.Draw(im)
 d.text((76,46),'G U L A N G Y U',font=font(en,24),fill=(247,243,222,245));d.text((W-260,48),'XIAMEN  /  CHINA',font=font(en,17),fill=(247,243,222,240))
 d.line((78,899,126,899),fill=(231,194,130,255),width=3)
 d.text((78,924),title,font=font(cn,48),fill=(250,247,233,255));d.text((81,994),subtitle,font=font(en,17),fill=(220,231,220,255))
 d.text((W-594,1016),'Map data © OpenStreetMap contributors · ODbL',font=font(en,16),fill=(226,235,225,245))
 if i==0:
  d.text((76,111),'鼓 浪 屿',font=font(cn,100),fill=(250,245,226,255));d.text((83,244),'海 上 花 园',font=font(cn,20),fill=(246,233,204,250));d.text((238,246),'/ BLENDER ENVIRONMENT STUDY',font=font(en,18),fill=(246,233,204,250))
 im.save(A/f'title_{i}.png')
# A newly synthesized, quiet piano-and-sea sound bed (no sampled commercial music).
fs=48000;duration=24;N=fs*duration;t=np.arange(N)/fs;audio=np.zeros(N);rng=np.random.default_rng(220)
chords=[[50,57,62,66,69],[47,54,59,62,66],[43,50,55,59,62],[45,52,57,61,64]]
for bar,chord in enumerate(chords):
 for k in range(8):
  start=bar*6+k*.67;note=chord[k%len(chord)]+(12 if k>4 else 0);freq=440*2**((note-69)/12);length=min(4,duration-start);tt=np.arange(int(length*fs))/fs
  env=(1-np.exp(-tt*110))*np.exp(-tt/1.2);sig=sum(amp*np.sin(2*np.pi*freq*(n+1)*tt+0.0001*n*tt**2) for n,amp in enumerate([1,.28,.10,.055,.025]))*env*.035
  off=int(start*fs);audio[off:off+len(sig)]+=sig
for delay,amp in [(.173,.15),(.39,.13),(.71,.08)]:
 n=int(delay*fs);audio[n:]+=audio[:-n].copy()*amp
surf=sosfilt(butter(2,[140,1700],fs=fs,btype='bandpass',output='sos'),rng.normal(0,1,N))*(.009+.006*np.sin(2*np.pi*t/7.3)**2);audio+=surf
fade=np.minimum(np.minimum(t/1.4,(duration-t)/1.7),1);audio*=fade
stereo=np.stack([audio,np.roll(audio,190)],1);stereo/=max(1,np.max(abs(stereo))/.72)
with wave.open(str(A/'original_ambient.wav'),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(fs);w.writeframes(np.int16(stereo*32767).tobytes())
# Compose only after every native camera frame is present.
frames=R/'render'/'frames';missing=[i for i in range(1,577) if not (frames/f'{i:04}.png').exists()]
if missing:print('Graphics and sound ready; waiting for',len(missing),'frames');raise SystemExit(0)
cmd=['/opt/homebrew/bin/ffmpeg','-y','-framerate','24','-start_number','1','-i',str(frames/'%04d.png')]
for i in range(6):cmd+=['-loop','1','-i',str(A/f'title_{i}.png')]
cmd+=['-i',str(A/'original_ambient.wav')]
filters=[];prev='0:v'
for i in range(6):
 out=f'v{i}';filters.append(f'[{prev}][{i+1}:v]overlay=0:0:enable=\'gte(t,{i*4})*lt(t,{(i+1)*4})\'[{out}]');prev=out
filters.append(f'[{prev}]fade=t=in:st=0:d=0.5,fade=t=out:st=23.35:d=0.65,format=yuv420p[video]')
cmd+=['-filter_complex',';'.join(filters),'-map','[video]','-map','7:a','-t','24','-c:v','libx264','-preset','slow','-crf','18','-r','24','-c:a','aac','-b:a','192k','-movflags','+faststart',str(D/'Gulangyu_Showcase_1080p.mp4')]
subprocess.run(cmd,check=True)
# Six-frame review sheet and a native-render poster.
contact=Image.new('RGB',(1920,1260),(18,28,26));draw=ImageDraw.Draw(contact)
for i,f in enumerate([48,144,240,336,432,528]):
 im=Image.open(frames/f'{f:04}.png').convert('RGB');im=im.resize((960,540),Image.Resampling.LANCZOS);im=im.resize((640,360),Image.Resampling.LANCZOS)
 x=(i%3)*640;y=70+(i//3)*590;contact.paste(im,(x,y));draw.text((x+24,y+386),titles[i][0],font=font(cn,26),fill=(234,226,201));draw.text((x+24,y+427),titles[i][1],font=font(en,16),fill=(154,180,168))
draw.text((26,20),'GULANGYU  /  CAMERA CONTACT SHEET',font=font(en,23),fill=(232,226,205));draw.text((26,1215),'Map data © OpenStreetMap contributors · ODbL / Reference-modeled environment study',font=font(en,17),fill=(154,180,168));contact.save(D/'Contact_Sheet.jpg',quality=92)
poster=Image.open(frames/'0240.png').convert('RGBA');poster=Image.alpha_composite(poster,Image.open(A/'title_2.png'));poster.convert('RGB').save(D/'Poster.jpg',quality=95)
print('FILM_FINISHED')
