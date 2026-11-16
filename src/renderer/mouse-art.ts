/** Independently drawn, scalable top view of a five-button gaming mouse. */
export function mouseArtwork(selected:string|null,available:string[]=[]){
 const hot=(source:string,n:number,x:number,y:number)=>available.includes(source)?`<g class="mouse-hotspot ${selected===source?'selected':''}" data-source="${source}" role="button" tabindex="0" aria-label="Select mouse button ${n}" aria-pressed="${selected===source}"><circle cx="${x}" cy="${y}" r="14"/><text x="${x}" y="${y}" dominant-baseline="central" text-anchor="middle">${n}</text></g>`:'';
 return `<svg class="mouse-art" viewBox="0 0 300 480" role="img" aria-label="Five-button gaming mouse, top view" xmlns="http://www.w3.org/2000/svg">
 <defs>
  <linearGradient id="mouse-shell" x1="0" y1="0" x2="1" y2=".65"><stop stop-color="#55575d"/><stop offset=".18" stop-color="#37393f"/><stop offset=".6" stop-color="#2c2e33"/><stop offset="1" stop-color="#202227"/></linearGradient>
  <linearGradient id="mouse-buttons" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#44464d"/><stop offset="1" stop-color="#303238"/></linearGradient>
  <linearGradient id="mouse-wheel" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#141519"/><stop offset=".45" stop-color="#565962"/><stop offset="1" stop-color="#15161b"/></linearGradient>
  <radialGradient id="mouse-sheen" cx=".25" cy=".2" r=".9"><stop stop-color="#fff" stop-opacity=".055"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 </defs>
 <ellipse cx="150" cy="448" rx="100" ry="15" fill="#08090b" opacity=".32"/>
 <path d="M150 20C94 20 59 43 46 91C35 131 34 189 27 278C19 376 36 451 150 459C264 451 281 376 273 278C266 189 265 131 254 91C241 43 206 20 150 20Z" fill="url(#mouse-shell)" stroke="#62656e" stroke-width="1.4"/>
 <path d="M150 24C95 24 64 46 51 91C44 117 41 149 39 177C73 188 110 191 150 191Z" fill="url(#mouse-buttons)"/>
 <path d="M154 24C207 25 237 47 250 92C257 118 260 149 262 177C228 188 191 191 154 191Z" fill="url(#mouse-buttons)"/>
 <path d="M150 23V66M150 137V190M39 178Q150 206 262 178" fill="none" stroke="#111217" stroke-width="2.4" stroke-linecap="round"/>
 <path d="M55 94C67 48 97 29 137 28M268 290C275 378 251 432 205 444" fill="none" stroke="#a0a3ab" stroke-opacity=".16" stroke-width="2" stroke-linecap="round"/>
 <path d="M150 20C94 20 59 43 46 91C35 131 34 189 27 278C19 376 36 451 150 459C264 451 281 376 273 278C266 189 265 131 254 91C241 43 206 20 150 20Z" fill="url(#mouse-sheen)"/>
 <rect x="133" y="64" width="34" height="77" rx="16" fill="#131419" stroke="#4a4d55" stroke-width="1.2"/>
 <rect x="139" y="71" width="22" height="63" rx="9" fill="url(#mouse-wheel)"/>
 <path d="M140 80H160M140 89H160M140 98H160M140 107H160M140 116H160M140 125H160" stroke="#15161a" stroke-width="3"/>
 <path d="M34 194L31 230Q23 232 24 223L26 203Q27 196 34 194Z" fill="#17191e" stroke="#777b84" stroke-width="1.2"/>
 <path d="M30 242L28 278Q20 279 21 269L23 249Q24 243 30 242Z" fill="#17191e" stroke="#777b84" stroke-width="1.2"/>
 <text x="150" y="358" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="500" fill="#9da1ac" opacity=".65">G</text>
 ${hot('BTN_LEFT',1,94,108)}${hot('BTN_RIGHT',2,207,108)}${hot('BTN_MIDDLE',3,150,162)}${hot('BTN_SIDE',4,47,213)}${hot('BTN_EXTRA',5,43,261)}
 </svg>`;
}
