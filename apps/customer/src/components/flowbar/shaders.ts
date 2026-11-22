/** A full-screen triangle. */
export const VS = `#version 300 es
in vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

/**
 * The Flow Tab Bar shader (glass bar fused with a liquid bead, refraction, the bead's light, ripple, rim, sweep and
 * specular), kept as designed. Site change, at the end only: instead of painting the whole page, the output is
 * transparent outside the glass apart from a soft shadow and the tab-coloured glow, faded at the canvas edges, and
 * premultiplied for compositing over the site. The design's page vignette is dropped (there is no page here).
 * Uniforms: uRes canvas px; uDpr device px per CSS px; uT time (s); uView (x, y offset in CSS px, scale);
 * uB (bead x, rise, stretch); uAcc the light; uTap (ripple x, age s, -); uSw the sweep 0 to 1.
 */
export const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;uniform float uDpr,uT;uniform vec3 uView,uB,uAcc,uTap;uniform float uSw;
out vec4 o;
const float TAU=6.2831853;
float sq(float x){return x*x;}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+7.1;a*=.5;}return s;}
float sdBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
vec2 bead(){return vec2(uB.x,572.-uB.y*46.);}
float shape(vec2 p){
 float bar=sdBox(p-vec2(540.,600.),vec2(404.,62.),46.);
 vec2 q=p-bead();float sx=uB.z;q.x/=sx;q.y*=mix(1.,sx,.35);
 float bd=(length(q)-46.)*min(1.,1./mix(1.,sx,.35));
 return smin(bar,bd,38.);}
vec3 bg(vec2 p){
 float ph=TAU*uT/8.;
 vec3 c=vec3(.012,.012,.018);
 vec2 u=p/1080.;
 float n=fbm(u*2.2+vec2(cos(ph),sin(ph))*.18);
 c+=vec3(.05,.06,.11)*smoothstep(.35,.85,n)*.7;
 vec2 d=p-vec2(uB.x,650.);
 c+=uAcc*exp(-dot(d*vec2(1.,1.5),d*vec2(1.,1.5))/(2.*230.*230.))*.42;
 vec2 d2=p-vec2(1080.-uB.x,430.);
 c+=uAcc.zxy*exp(-dot(d2,d2)/(2.*300.*300.))*.1;
 return c;}
void main(){
 vec2 p=(vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr-uView.xy)/uView.z+vec2(540.);
 float d=shape(p);float e=1.5;
 vec2 g=vec2(shape(p+vec2(e,0.))-d,shape(p+vec2(0.,e))-d)/e;
 float inM=smoothstep(.8,-.8,d);
 vec3 col=bg(p);
 col*=1.-.5*exp(-max(d,0.)/34.)*(1.-inM)*smoothstep(520.,640.,p.y+40.);
 if(inM>0.){
  float edge=exp(d/15.);
  vec2 off=-g*edge*46.;
  vec3 fr=vec3(0.);
  for(int i=0;i<4;i++){float an=float(i)*1.5708+.6;fr+=bg(p+off+vec2(cos(an),sin(an))*40.);}
  fr*=.25;
  vec3 glass=fr*.5+vec3(.03,.03,.04);
  glass+=fr*edge*.4;
  // light source living inside the glass, travelling with the active tab
  vec2 b=bead();vec2 q=p-vec2(b.x,b.y+10.);
  float l=length(q*vec2(1./uB.z,1.15));
  glass+=uAcc*(exp(-l/78.)*.5+exp(-l/26.)*.55*uB.y)+vec3(1.)*exp(-l/12.)*.12*uB.y;
  // tap ripple
  float r=length(p-vec2(uTap.x,600.));
  glass+=(uAcc*.6+.2)*exp(-sq((r-20.-uTap.y*90.)/3.))*max(0.,1.-uTap.y/.45)*.22*step(0.,uTap.y);
  // rim
  float rim=exp(-sq((d+1.3)/1.1));
  float lit=.2+.8*pow(clamp(dot(normalize(g+1e-4),normalize(vec2(-.35,-.94))),0.,1.),1.4);
  glass+=(vec3(1.)*.55+uAcc*.35)*rim*lit;
  float ang=atan(g.y,g.x);
  glass+=(.5+.5*cos(ang*2.+p.x*.006+vec3(0.,2.1,4.2)))*rim*.16;
  // one soft light sweep across the glass after each landing
  float sx=136.+808.*uSw+(p.y-600.)*.7;
  glass+=vec3(1.)*exp(-sq((p.x-sx)/46.))*sin(3.14159*uSw)*.06;
  glass+=vec3(1.)*.05*smoothstep(-30.,-4.,d)*clamp((600.-p.y)/62.,0.,1.);
  // small specular on the bead cap
  vec2 s=p-(b+vec2(-14.,-20.)*uB.y);
  glass+=vec3(1.)*exp(-dot(s*vec2(.6,1.4),s*vec2(.6,1.4))/60.)*.22*uB.y;
  glass+=(h21(p)-.5)*.012;
  col=mix(col,glass,inM);
 }
 // site version: transparent outside the glass, keeping a soft shadow and the tab-coloured glow
 vec2 gd=p-vec2(uB.x,650.);
 float glowA=exp(-dot(gd*vec2(1.,1.5),gd*vec2(1.,1.5))/(2.*150.*150.))*.35;
 float shA=.5*exp(-max(d,0.)/22.)*smoothstep(520.,640.,p.y+40.);
 float fade=smoothstep(0.,36.,min(min(p.x-100.,980.-p.x),min(p.y-450.,710.-p.y)));
 float al=max(inM,max(shA,glowA)*(1.-inM)*fade);
 col=1.-exp(-col*1.25);
 col+=(h21(p+fract(uT*7.))-.5)/255.;
 o=vec4(col*al,al);}`;
