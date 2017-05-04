a=1
new Promise((resolve)=>{
    resolve(a+1)
}).then((b)=>{
    return b+1
}).then((c)=>{
    return c+1
}).then((d)=>{
    return d+1
}).then((e)=>{
    return e+1
}).then((f)=>{
    return f+1
}).then((g)=>{
    console.log(g)
})