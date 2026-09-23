// Login page background: animated network of teal nodes on #nc.
!function(){const c=document.getElementById('nc');if(!c)return;const x=c.getContext('2d');let w,h,N=[],a;
function rs(){const r=devicePixelRatio||1;w=c.width=c.offsetWidth*r;h=c.height=c.offsetHeight*r;x.setTransform(r,0,0,r,0,0)}
function cr(){N=[];const n=Math.floor((c.offsetWidth*c.offsetHeight)/18000);for(let i=0;i<n;i++)N.push({x:Math.random()*c.offsetWidth,y:Math.random()*c.offsetHeight,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*2+1.5,o:Math.random()*.4+.15})}
function dr(){x.clearRect(0,0,c.offsetWidth,c.offsetHeight);for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++){const dx=N[i].x-N[j].x,dy=N[i].y-N[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d<150){x.strokeStyle=`rgba(45,212,191,${(1-d/150)*.12})`;x.lineWidth=.8;x.beginPath();x.moveTo(N[i].x,N[i].y);x.lineTo(N[j].x,N[j].y);x.stroke()}}
for(const n of N){x.fillStyle=`rgba(45,212,191,${n.o})`;x.beginPath();x.arc(n.x,n.y,n.r,0,Math.PI*2);x.fill();n.x+=n.vx;n.y+=n.vy;if(n.x<0||n.x>c.offsetWidth)n.vx*=-1;if(n.y<0||n.y>c.offsetHeight)n.vy*=-1}
a=requestAnimationFrame(dr)}
addEventListener('resize',()=>{cancelAnimationFrame(a);rs();cr();dr()});rs();cr();dr()}();
