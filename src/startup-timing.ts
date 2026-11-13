// Read-only browser timeline diagnostics. Unsupported timeline observation must
// never change startup, editing, History or file behavior.
export function startupNow(){return performance.now();}
export function startupMark(name:string){try{performance.mark('rhwp:'+name);}catch{}}
export function startupStage(name:string,start:number){try{performance.measure('rhwp:'+name,{start,end:performance.now()});}catch{}}
