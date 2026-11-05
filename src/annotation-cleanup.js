// Exclude only matched annotation geometry. Unmatched labels remain for review.
export function excludeDimensions(paths,circles,texts,dimensions){
 const matched=dimensions.filter(d=>d.autoEndpoints&&d.sourcePathIndices?.length>=3);
 const indices=new Set(matched.flatMap(d=>d.sourcePathIndices));
 const boxes=matched.map(d=>d.bbox).filter(Boolean);
 const inside=(p,b)=>p[0]>=b.x0-2&&p[0]<=b.x1+2&&p[1]>=b.y0-2&&p[1]<=b.y1+2;
 const isLabel=t=>matched.some(d=>d.textX===t.x&&d.textY===t.y&&d.originalLabel===t.value);
 const result=paths.filter((p,i)=>!indices.has(i)&&!boxes.some(b=>p.every(point=>inside(point,b))));
 return {paths:result,circles:circles.filter(c=>!boxes.some(b=>inside([c.center[0]-c.radius,c.center[1]-c.radius],b)&&inside([c.center[0]+c.radius,c.center[1]+c.radius],b))),
  texts:texts.filter(t=>!isLabel(t)),stats:{matched:matched.length,removedPaths:paths.length-result.length,
   unmatched:dimensions.length-matched.length}};
}
