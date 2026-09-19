/* core.mjs — physics extracted VERBATIM from antenna-analyzer.html.
   Keep this a byte-for-byte copy of the in-page PHYSICS + model + analyze block.
   If you change the physics in the HTML, re-extract; if a test below fails after an
   intentional change, the change is wrong (see the reference table in HANDOFF.md). */

const PI=Math.PI, ETA=120*PI, GAMMA=0.5772156649015329;
function simpson(f,a,b,n){if(n%2)n++;const h=(b-a)/n;let s=f(a)+f(b);
  for(let i=1;i<n;i++)s+=(i%2?4:2)*f(a+i*h);return s*h/3;}
function Si(x){if(x===0)return 0;const g=Math.sign(x);x=Math.abs(x);
  const n=Math.max(60,Math.ceil(36*x));return g*simpson(t=>t===0?1:Math.sin(t)/t,0,x,n);}
function Ci(x){x=Math.abs(x);if(x<1e-9)x=1e-9;const n=Math.max(60,Math.ceil(36*x));
  return GAMMA+Math.log(x)+simpson(t=>t===0?0:(Math.cos(t)-1)/t,0,x,n);}
const cx=(re,im=0)=>({re,im});
const cadd=(a,b)=>cx(a.re+b.re,a.im+b.im);
const cmul=(a,b)=>cx(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
const cdiv=(a,b)=>{const d=b.re*b.re+b.im*b.im;return cx((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d);};
const cabs=a=>Math.hypot(a.re,a.im);

function selfZ(L,a){const kL=2*PI*L;
  const R=(ETA/(2*PI))*(GAMMA+Math.log(kL)-Ci(kL)
    +0.5*Math.sin(kL)*(Si(2*kL)-2*Si(kL))
    +0.5*Math.cos(kL)*(GAMMA+Math.log(kL/2)+Ci(2*kL)-2*Ci(kL)));
  const ka2L=2*(2*PI)*a*a/L;
  const X=(ETA/(4*PI))*(2*Si(kL)+Math.cos(kL)*(2*Si(kL)-Si(2*kL))
    -Math.sin(kL)*(2*Ci(kL)-Ci(2*kL)-Ci(ka2L)));
  return cx(R,X);}
function mutualZ(d){const k=2*PI,L=0.5,r=Math.hypot(d,L);
  const u0=k*d,u1=k*(r+L),u2=k*(r-L);
  return cx((ETA/(4*PI))*(2*Ci(u0)-Ci(u1)-Ci(u2)),
           -(ETA/(4*PI))*(2*Si(u0)-Si(u1)-Si(u2)));}
function solve(Z,V){const n=V.length;
  const A=Z.map((row,i)=>[...row.map(c=>({...c})),{...V[i]}]);
  for(let c=0;c<n;c++){let p=c,b=cabs(A[c][c])**2;
    for(let r=c+1;r<n;r++){const m=cabs(A[r][c])**2;if(m>b){b=m;p=r;}}
    [A[c],A[p]]=[A[p],A[c]];const dv=A[c][c];
    for(let j=c;j<=n;j++)A[c][j]=cdiv(A[c][j],dv);
    for(let r=0;r<n;r++){if(r===c)continue;const f=A[r][c];
      for(let j=c;j<=n;j++)A[r][j]=cadd(A[r][j],cmul(cx(-f.re,-f.im),A[c][j]));}}
  return A.map(r=>r[n]);}

function elemPat(t){const s=Math.sin(t);if(Math.abs(s)<1e-9)return 0;
  return Math.cos(PI/2*Math.cos(t))/s;}
function dipolePat(t,L){const s=Math.sin(t);if(Math.abs(s)<1e-9)return 0;
  const k=PI*L;return Math.abs((Math.cos(k*Math.cos(t))-Math.cos(k))/s);}

/* generic array of z-oriented dipoles at 3D positions, complex currents */
function arrayField(t,p,els){const k=2*PI;let re=0,im=0;
  const ux=Math.sin(t)*Math.cos(p),uy=Math.sin(t)*Math.sin(p),uz=Math.cos(t);
  for(const e of els){const ph=k*(e.x*ux+e.y*uy+e.z*uz);
    const c=Math.cos(ph),s=Math.sin(ph);
    re+=e.I.re*c-e.I.im*s; im+=e.I.re*s+e.I.im*c;}
  return elemPat(t)*Math.hypot(re,im);}

/* ---- model builder: state -> {field(t,p), els, halfSpace, kind} ---- */
function buildModel(S){
  const A_WIRE=0.0032; // wire radius in λ for the MoM self-Z
  switch(S.type){
    case 'iso':      return {field:()=>1, els:[], kind:'iso'};
    case 'short':    return {field:t=>Math.sin(t), els:[], kind:'lin'};
    case 'halfwave': return {field:t=>dipolePat(t,0.5), els:[], kind:'lin'};
    case 'dipole':   return {field:t=>dipolePat(t,S.dipoleLen), els:[], kind:'lin'};
    case 'monopole': return {field:t=>t<=PI/2?dipolePat(t,0.5):0, els:[], halfSpace:true, kind:'mono'};
    case 'pair':{
      const d=S.pairSpacing, ph=S.pairPhase*PI/180;
      const els=[{x:-d/2,y:0,z:0,I:cx(1,0)},
                 {x: d/2,y:0,z:0,I:cx(Math.cos(ph),Math.sin(ph))}];
      return {field:(t,p)=>arrayField(t,p,els), els, kind:'arr'};}
    case 'collinear':{
      const N=S.colN, s=S.colSpacing, els=[];
      for(let i=0;i<N;i++)els.push({x:0,y:0,z:(i-(N-1)/2)*s,I:cx(1,0)});
      return {field:(t,p)=>arrayField(t,p,els), els, kind:'col'};}
    case 'yagi':{
      const g=yagiGeom(S);
      const n=g.x.length, Z=Array.from({length:n},()=>Array(n));
      for(let i=0;i<n;i++)for(let j=0;j<n;j++)
        Z[i][j]=i===j?selfZ(g.len[i],A_WIRE):mutualZ(Math.abs(g.x[i]-g.x[j]));
      const V=g.x.map((_,i)=>i===g.driven?cx(1,0):cx(0,0));
      const I=solve(Z,V);
      const els=g.x.map((x,i)=>({x,y:0,z:0,I:I[i]}));
      return {field:(t,p)=>arrayField(t,p,els), els, kind:'arr', currents:I, geom:g};}
  }
}
function yagiGeom(S){
  const x=[-S.reflSp,0], len=[0.482,0.466];
  let pos=S.dir1; const nd=S.nDir;
  for(let i=0;i<nd;i++){x.push(pos);len.push(Math.max(0.40,0.442-i*S.taper));pos+=S.dirSp;}
  return {x,len,driven:1};
}

/* ---- analyzer ---- */
function analyze(M){
  const N=130; let umax=0,integ=0;
  for(let it=0;it<N;it++){const t=(it+0.5)/N*PI,st=Math.sin(t);
    for(let ip=0;ip<N;ip++){const p=(ip+0.5)/N*2*PI;
      const u=M.field(t,p)**2; if(u>umax)umax=u; integ+=u*st;}}
  integ*=(PI/N)*(2*PI/N);
  const D=10*Math.log10(4*PI*umax/integ);
  const fmax=Math.sqrt(umax);
  // gain in dBi at any direction
  const gain=(t,p)=>{const f=M.field(t,p);return D+20*Math.log10(Math.max(f,1e-6)/fmax);};
  // HPBW along principal cuts; find main beam direction first
  // E-plane = x-z plane: phi=0 (theta 0..180) and phi=PI (theta 0..180) => param ang 0..360 around
  // sample E-cut as function of signed angle from +Z
  const Ecut=ang=>{ // ang deg, 0=+Z up, 90=+X, 180=-Z, 270=-X
    const a=ang*PI/180; const t=Math.acos(Math.cos(a)); const p=Math.sin(a)>=0?0:PI;
    return gain(t,p);};
  const Hcut=ang=>gain(PI/2,ang*PI/180); // azimuth
  // peak directions
  let ePeak=0,eMax=-1e9; for(let a=0;a<360;a++){const g=Ecut(a);if(g>eMax){eMax=g;ePeak=a;}}
  let hPeak=0,hMax=-1e9; for(let a=0;a<360;a++){const g=Hcut(a);if(g>hMax){hMax=g;hPeak=a;}}
  const hpbw=(cut,peak,pk)=>{const th=pk-3;let lo=null,hi=null;
    for(let i=0;i<=180;i++){if(cut(peak-i)<th){lo=i;break;}}
    for(let i=0;i<=180;i++){if(cut(peak+i)<th){hi=i;break;}}
    if(lo===null||hi===null)return null;return lo+hi;};
  const hpbwE=hpbw(Ecut,ePeak,eMax), hpbwH=hpbw(Hcut,hPeak,hMax);
  // F/B (use azimuth peak vs +180)
  const fb=hMax-Hcut(hPeak+180);
  // side-lobe level in H plane (max outside ±main beam)
  let sll=-99; const guard=hpbwH?hpbwH:30;
  for(let a=10;a<350;a+=1){let dd=Math.abs(((a-hPeak+540)%360)-180);
    if(dd>guard*0.8){const g=Hcut(a)-hMax;if(g>sll)sll=g;}}
  return {D,fmax,gain,Ecut,Hcut,ePeak,hPeak,eMax,hMax,hpbwE,hpbwH,fb,sll};
}

const YAGI_PRESETS={
  '2el':{reflSp:.20,dir1:.20,dirSp:.20,nDir:0,taper:.004},
  '3el':{reflSp:.20,dir1:.20,dirSp:.20,nDir:1,taper:.004},
  '4el':{reflSp:.20,dir1:.18,dirSp:.22,nDir:2,taper:.004},
  '5el':{reflSp:.20,dir1:.18,dirSp:.21,nDir:3,taper:.004},
  '6el':{reflSp:.20,dir1:.18,dirSp:.28,nDir:4,taper:.004},
};

export { PI, ETA, GAMMA, simpson, Si, Ci, cx, cadd, cmul, cdiv, cabs, selfZ, mutualZ, solve, elemPat, dipolePat, arrayField, buildModel, yagiGeom, analyze, YAGI_PRESETS };
