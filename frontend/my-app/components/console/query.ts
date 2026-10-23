export function buildQuery(route: {path:string;method:string}, flags:Record<string,string>) {
 if(route.method!=='GET')return undefined;
 const names:Record<string,string>={'limit':'limit','cursor':'cursor','project-id':'projectId','run-id':'runId','provider-id':'providerId','state':'state','status':'status','from':'from','to':'to','category':'category','capability':'capability'};
 const query:Record<string,string>={};
 for(const [key,value] of Object.entries(flags))if(names[key])query[names[key]]=value;
 return Object.keys(query).length?query:undefined;
}
