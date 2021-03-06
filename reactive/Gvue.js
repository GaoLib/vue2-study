// * 数组响应式
const originalProto = Array.prototype
const arrayProto = Object.create(originalProto);
['push', 'pop', 'shift', 'unshift', 'sort', 'splice', 'reverse'].forEach((method) => {
  arrayProto[method] = function() {
    originalProto[method].apply(this, arguments)
    this.__ob__.dep.notify()
  }
})


function defineReactive(obj, key, val) {
  // ! 递归处理 
  observe(val)

  // ! 创建对应的Dep实例
  const dep = new Dep()

  Object.defineProperty(obj, key, {
    get() {
      // ! 添加依赖
      // Dep.target && dep.addDep(Dep.target)
      if (Dep.target) {
        dep.addDep(Dep.target)
        if (Array.isArray(val)) {
          dependArray(val)
        }
      }
      return val
    },
    set(newVal) {
      if (newVal !== val) {
        console.log('set', key)
        // ! 处理newVal也是对象的情况
        observe(newVal)
        val = newVal

        dep.notify()
      }
    }
  })
}

// * 遍历obj中每个key，执行响应式定义
function observe(obj) {
  // ! 判断传入obj是否是对象
  if (typeof obj !== 'object' || obj === null) return

  new Observer(obj)
}

function def(obj, key, val, enumerable = false) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true,
  })
}

function dependArray (value) {
  value && value.__ob__ && value.__ob__ && value.__ob__.dep.addDep(Dep.target)
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep && e.__ob__.dep.addDep(Dep.target)
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}


// * 传入obj, 判断obj类型，做不同响应式处理
class Observer {
  constructor(value) {
    this.value = value
    this.dep = new Dep()
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      value.__proto__ = arrayProto
      const keys = Object.keys(value)
      for (let i = 0; i < keys.length; i++) {
        observe(value[i]);
      }
    } else {
      this.walk(value)
    }
  }

  walk(obj) {
    Object.keys(obj).forEach((key) => {
      defineReactive(obj, key, obj[key])
    })
  }
}

function proxy(vm) {
  Object.keys(vm.$data).forEach((key) => {
    Object.defineProperty(vm, key, {
      get() {
        return vm.$data[key]
      },
      set(v) {
        vm.$data[key] = v
      }
    })
  })
}

class Gvue {
  constructor(options) {
    // * 1. 保存配置
    this.$options = options
    this.$data = options.data
    this.$methods = options.methods
    // * 2. 对data响应式处理
    observe(this.$data)
    // * 3. 代理
    proxy(this)
    // * 4. 编译视图模板
    new Compile(options.el, this)
  }
}

Gvue.prototype.$set = set

class Compile {
  constructor(el, vm) {
    this.$vm = vm
    this.$el = document.querySelector(el)

    if (this.$el) this.compile(this.$el)
  }
  
  compile(el) {
    // * 对el dom数递归遍历
    // ! children 只返回HTML节点，不返回文本节点
    el.childNodes.forEach((node) => {
      // * 元素
      if (node.nodeType === 1) {
        this.compileElement(node)
        if (node.childNodes.length) this.compile(node)
      }
      // * 文本
      if (this.isInter(node)) {
        this.compileText(node)
      }
    })
  }

  isInter(node) {
    return node.nodeType === 3 && /\{\{(.*)\}\}/.test(node.textContent)
  }

  // ! 每当解析出依赖时
  update(node, exp, dir) {
    // ! 1. 初始化
    const fn = this[`${dir}Updater`]
    // ! obj.foo 嵌套对象情况
    let tep = this.$vm[exp]
    const values = exp.split('.')
    if (values.length > 1 && this.$vm[values[0]]) {
      tep = values.reduce((obj, value) => {
        return obj[value]
      }, this.$vm)
    }
    fn && fn(node, tep)
    // ! 2. 创建watcher实例
    new Watcher(this.$vm, exp, function(val) {
      fn && fn(node, val)
    })
  }

  // * {{ xxx }}
  compileText(node) {
    this.update(node, RegExp.$1.trim(), 'text')
  }

  textUpdater(node, val) {
    node.textContent = val
  }

  compileElement(node) {
    const nodeAttrs = node.attributes
    Array.from(nodeAttrs).forEach((attr) => {
      const attrName = attr.name
      const exp = attr.value
      if (this.isDir(attrName)) {
        const dir = attrName.substring(2)
        this[dir] && this[dir](node, exp)
      }
      if (this.isEvent(attrName)) {
        const eveName = attrName.substring(1)
        node.addEventListener(eveName, () => {
          this.$vm.$methods[exp].call(this.$vm)
        })
      }
    })
  }
  
  isDir(attr) {
    return attr.startsWith('g-')
  }

  isEvent(attr) {
    return attr[0] ===  '@'
  }

  // * g-text
  text(node, exp) {
    this.update(node, exp, 'text')
  }

  // * g-html
  html(node, exp) {
    this.update(node, exp, 'html')
  }

  // * g-model
  model(node, exp) {
    this.update(node, exp, 'model')
    node.addEventListener('input', (e) => {
      this.$vm[exp] = e.target.value
    })
  }

  htmlUpdater(node, val) {
    node.innerHTML = val
  }

  modelUpdater(node, val) {
    node.value = val
  }
}

// ! 收集更新函数，负责视图中依赖的更新
class Watcher {
  constructor(vm, key, updater) {
    this.$vm = vm
    this.$key = key
    this.$updater = updater

    // ! 尝试读取key,触发依赖收集
    Dep.target = this
    // this.$vm[this.$key]
    let exp = this.$key
    const values = exp.split('.')
    if (values.length > 1 && this.$vm[values[0]]) {
      exp = values.reduce((obj, value) => {
        return obj[value]
      }, this.$vm)
    } else {
      this.$vm[exp]
    }
    Dep.target = null
  }

  // ! 会被Dep调用
  update() {
    this.$updater.call(this.$vm, this.$vm[this.$key])
  }
}

// ! Dep 和 data 中的每一个key一一对应
class Dep {
  constructor() {
    this.deps = []
  }
  
  addDep(watcher) {
    this.deps.push(watcher)
  }

  notify() {
    this.deps.forEach(watcher => watcher.update())
  }
}

function set(target, key, val) {
  console.log(target.__ob__)
  if (Array.isArray(target)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = target.__ob__
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}
