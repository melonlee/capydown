import json
# geometry
cx, top, a, h = 512, 300, 210, 236
k = 0.5774  # tan 30
N=(cx, top); E=(cx+a, top+a*k); S=(cx, top+2*a*k); W=(cx-a, top+a*k)
def add(p,q): return (p[0]+q[0], p[1]+q[1])
D=(0,h)
def poly(pts): return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x,y in pts) + ' Z'
left = poly([W,S,add(S,D),add(W,D)])
right = poly([S,E,add(E,D),add(S,D)])
topf = poly([N,E,S,W])
def lf(u,v):  # point on left face
    return (W[0]+u*(S[0]-W[0]), W[1]+u*(S[1]-W[1])+v*h)
lines=[]
for (u0,u1,v,w) in [(0.16,0.62,0.22,22),(0.16,0.84,0.45,13),(0.16,0.84,0.62,13),(0.16,0.56,0.79,13)]:
    p,q=lf(u0,v),lf(u1,v)
    lines.append((p,q,w))
def zpath(x,y,s):
    return f'M{x:.1f} {y:.1f} h{s:.1f} l{-s:.1f} {s:.1f} h{s:.1f}'
z1=zpath(cx+150, top-40, 46); z2=zpath(cx+222, top-118, 30)
json.dump({'left':left,'right':right,'top':topf,'lines':[[p,q,w] for p,q,w in lines],'z1':z1,'z2':z2}, open('mark.json','w'))
