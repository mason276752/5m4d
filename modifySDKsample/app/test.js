//浏览器执行
var value='word'
var obj = {
  value: 'hello',
  getField1:function(){
    console.log(this.value)
  },
  getField2: () => {
    console.log(this.value)
  }
};
obj.getField1()
obj.getField2()
//#################
obj2={
    show(){
        value="IBM微讲堂"
        obj.getField1()
        obj.getField2()
    }
}
obj2.show()