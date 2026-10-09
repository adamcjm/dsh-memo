// dsh-memo — 浏览器半侧（client bundle）
//
// 格式是 DSH 客户端模块系统的入口协议：执行本文件只注册 factory，
// 模块副作用（样式注入等）都在 factory 物化时才发生。
// 对外导出的是 cordis 插件形态：{ inject: ['slots'], apply(ctx) }。
// 注册容错：DSH 的 client-modules 在 queue 阶段只入队、不去重；若本次页面启动中
// 本 bundle 被执行两次（例如 client-hmr 在启动窗口内换 rev，旧/新 URL 并发加载），
// 第二次 load() 会抛 "duplicate factory registration"。此时已有一份注册存在，忽略即可；
// 其它错误照常抛出，热重载路径（先 invalidate 再注册）不受影响。
try {
  window.__ModuleLoader__.load({
  id: '@adamcjm/dsh-memo',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // React 从平台模块表取；动态半边另有全局 React 兜底。
    var React = null
    try { React = require('react') } catch (e) { /* 回退到全局 */ }
    if (!React) React = globalThis.React
    if (!React) throw new Error('dsh-memo: React runtime unavailable')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useCallback = React.useCallback
    var useMemo = React.useMemo

    /* ------------------------------------------------------------------ *
     * SortableJS 1.15.7 — MIT — https://github.com/SortableJS/Sortable
     * 原样内联：本 bundle 刻意保持零构建（改完刷新即生效），第三方库只能这样带进来。
     * 用局部 module/exports 命中 UMD 的 CommonJS 分支，不往 window 上挂全局。
     * ------------------------------------------------------------------ */
    var SortableLib = null
    // SortableJS 在求值阶段就会探测 DOM（pointer events 支持检测），
    // 所以懒加载：只有真的要建拖拽实例时才实例化，SSR / 非浏览器环境不受影响。
    function getSortable() {
      if (SortableLib) return SortableLib
      var mod = { exports: {} }
      ;(function (module, exports) {
      /*! Sortable 1.15.7 - MIT | git://github.com/SortableJS/Sortable.git */
!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(t=t||self).Sortable=e()}(this,function(){"use strict";function o(t,e){(null==e||e>t.length)&&(e=t.length);for(var n=0,o=Array(e);n<e;n++)o[n]=t[n];return o}function i(t,e,n){return(e=function(t){t=function(t,e){if("object"!=typeof t||!t)return t;var n=t[Symbol.toPrimitive];if(void 0===n)return("string"===e?String:Number)(t);e=n.call(t,e||"default");if("object"!=typeof e)return e;throw new TypeError("@@toPrimitive must return a primitive value.")}(t,"string");return"symbol"==typeof t?t:t+""}(e))in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function a(){return(a=Object.assign?Object.assign.bind():function(t){for(var e=1;e<arguments.length;e++){var n,o=arguments[e];for(n in o)!{}.hasOwnProperty.call(o,n)||(t[n]=o[n])}return t}).apply(null,arguments)}function r(e,t){var n,o=Object.keys(e);return Object.getOwnPropertySymbols&&(n=Object.getOwnPropertySymbols(e),t&&(n=n.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),o.push.apply(o,n)),o}function I(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{};t%2?r(Object(n),!0).forEach(function(t){i(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):r(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function l(t,e){if(null==t)return{};var n,o=function(t,e){if(null==t)return{};var n,o={};for(n in t)if({}.hasOwnProperty.call(t,n)){if(-1!==e.indexOf(n))continue;o[n]=t[n]}return o}(t,e);if(Object.getOwnPropertySymbols)for(var i=Object.getOwnPropertySymbols(t),r=0;r<i.length;r++)n=i[r],-1===e.indexOf(n)&&{}.propertyIsEnumerable.call(t,n)&&(o[n]=t[n]);return o}function e(t){return function(t){if(Array.isArray(t))return o(t)}(t)||function(t){if("undefined"!=typeof Symbol&&null!=t[Symbol.iterator]||null!=t["@@iterator"])return Array.from(t)}(t)||function(t,e){if(t){if("string"==typeof t)return o(t,e);var n={}.toString.call(t).slice(8,-1);return"Map"===(n="Object"===n&&t.constructor?t.constructor.name:n)||"Set"===n?Array.from(t):"Arguments"===n||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?o(t,e):void 0}}(t)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function s(t){return(s="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t})(t)}function t(t){if("undefined"!=typeof window&&window.navigator)return!!navigator.userAgent.match(t)}var y=t(/(?:Trident.*rv[ :]?11\.|msie|iemobile|Windows Phone)/i),w=t(/Edge/i),c=t(/firefox/i),u=t(/safari/i)&&!t(/chrome/i)&&!t(/android/i),d=t(/iP(ad|od|hone)/i),n=t(/chrome/i)&&t(/android/i),h={capture:!1,passive:!1};function f(t,e,n){t.addEventListener(e,n,!y&&h)}function p(t,e,n){t.removeEventListener(e,n,!y&&h)}function g(t,e){if(e&&(">"===e[0]&&(e=e.substring(1)),t))try{if(t.matches)return t.matches(e);if(t.msMatchesSelector)return t.msMatchesSelector(e);if(t.webkitMatchesSelector)return t.webkitMatchesSelector(e)}catch(t){return}}function m(t){return t.host&&t!==document&&t.host.nodeType&&t.host!==t?t.host:t.parentNode}function P(t,e,n,o){if(t){n=n||document;do{if(null!=e&&(">"!==e[0]||t.parentNode===n)&&g(t,e)||o&&t===n)return t}while(t!==n&&(t=m(t)))}return null}var v,b=/\s+/g;function k(t,e,n){var o;t&&e&&(t.classList?t.classList[n?"add":"remove"](e):(o=(" "+t.className+" ").replace(b," ").replace(" "+e+" "," "),t.className=(o+(n?" "+e:"")).replace(b," ")))}function R(t,e,n){var o=t&&t.style;if(o){if(void 0===n)return document.defaultView&&document.defaultView.getComputedStyle?n=document.defaultView.getComputedStyle(t,""):t.currentStyle&&(n=t.currentStyle),void 0===e?n:n[e];o[e=!(e in o||-1!==e.indexOf("webkit"))?"-webkit-"+e:e]=n+("string"==typeof n?"":"px")}}function D(t,e){var n="";if("string"==typeof t)n=t;else do{var o=R(t,"transform")}while(o&&"none"!==o&&(n=o+" "+n),!e&&(t=t.parentNode));var i=window.DOMMatrix||window.WebKitCSSMatrix||window.CSSMatrix||window.MSCSSMatrix;return i&&new i(n)}function E(t,e,n){if(t){var o=t.getElementsByTagName(e),i=0,r=o.length;if(n)for(;i<r;i++)n(o[i],i);return o}return[]}function O(){var t=document.scrollingElement;return t||document.documentElement}function X(t,e,n,o,i){if(t.getBoundingClientRect||t===window){var r,a,l,s,c,u,d=t!==window&&t.parentNode&&t!==O()?(a=(r=t.getBoundingClientRect()).top,l=r.left,s=r.bottom,c=r.right,u=r.height,r.width):(l=a=0,s=window.innerHeight,c=window.innerWidth,u=window.innerHeight,window.innerWidth);if((e||n)&&t!==window&&(i=i||t.parentNode,!y))do{if(i&&i.getBoundingClientRect&&("none"!==R(i,"transform")||n&&"static"!==R(i,"position"))){var h=i.getBoundingClientRect();a-=h.top+parseInt(R(i,"border-top-width")),l-=h.left+parseInt(R(i,"border-left-width")),s=a+r.height,c=l+r.width;break}}while(i=i.parentNode);return o&&t!==window&&(o=(e=D(i||t))&&e.a,t=e&&e.d,e&&(s=(a/=t)+(u/=t),c=(l/=o)+(d/=o))),{top:a,left:l,bottom:s,right:c,width:d,height:u}}}function Y(t,e,n){for(var o=M(t,!0),i=X(t)[e];o;){var r=X(o)[n];if(!("top"===n||"left"===n?r<=i:i<=r))return o;if(o===O())break;o=M(o,!1)}return!1}function B(t,e,n,o){for(var i=0,r=0,a=t.children;r<a.length;){if("none"!==a[r].style.display&&a[r]!==Ht.ghost&&(o||a[r]!==Ht.dragged)&&P(a[r],n.draggable,t,!1)){if(i===e)return a[r];i++}r++}return null}function F(t,e){for(var n=t.lastElementChild;n&&(n===Ht.ghost||"none"===R(n,"display")||e&&!g(n,e));)n=n.previousElementSibling;return n||null}function j(t,e){var n=0;if(!t||!t.parentNode)return-1;for(;t=t.previousElementSibling;)"TEMPLATE"===t.nodeName.toUpperCase()||t===Ht.clone||e&&!g(t,e)||n++;return n}function S(t){var e=0,n=0,o=O();if(t)do{var i=D(t),r=i.a,i=i.d}while(e+=t.scrollLeft*r,n+=t.scrollTop*i,t!==o&&(t=t.parentNode));return[e,n]}function M(t,e){if(!t||!t.getBoundingClientRect)return O();var n=t,o=!1;do{if(n.clientWidth<n.scrollWidth||n.clientHeight<n.scrollHeight){var i=R(n);if(n.clientWidth<n.scrollWidth&&("auto"==i.overflowX||"scroll"==i.overflowX)||n.clientHeight<n.scrollHeight&&("auto"==i.overflowY||"scroll"==i.overflowY)){if(!n.getBoundingClientRect||n===document.body)return O();if(o||e)return n;o=!0}}}while(n=n.parentNode);return O()}function _(t,e){return Math.round(t.top)===Math.round(e.top)&&Math.round(t.left)===Math.round(e.left)&&Math.round(t.height)===Math.round(e.height)&&Math.round(t.width)===Math.round(e.width)}function C(e,n){return function(){var t;v||(1===(t=arguments).length?e.call(this,t[0]):e.apply(this,t),v=setTimeout(function(){v=void 0},n))}}function H(t,e,n){t.scrollLeft+=e,t.scrollTop+=n}function T(t){var e=window.Polymer,n=window.jQuery||window.Zepto;return e&&e.dom?e.dom(t).cloneNode(!0):n?n(t).clone(!0)[0]:t.cloneNode(!0)}function x(t,e){R(t,"position","absolute"),R(t,"top",e.top),R(t,"left",e.left),R(t,"width",e.width),R(t,"height",e.height)}function A(t){R(t,"position",""),R(t,"top",""),R(t,"left",""),R(t,"width",""),R(t,"height","")}function L(n,o,i){var r={};return Array.from(n.children).forEach(function(t){var e;P(t,o.draggable,n,!1)&&!t.animated&&t!==i&&(e=X(t),r.left=Math.min(null!==(t=r.left)&&void 0!==t?t:1/0,e.left),r.top=Math.min(null!==(t=r.top)&&void 0!==t?t:1/0,e.top),r.right=Math.max(null!==(t=r.right)&&void 0!==t?t:-1/0,e.right),r.bottom=Math.max(null!==(t=r.bottom)&&void 0!==t?t:-1/0,e.bottom))}),r.width=r.right-r.left,r.height=r.bottom-r.top,r.x=r.left,r.y=r.top,r}var K="Sortable"+(new Date).getTime();function N(){var e,o=[];return{captureAnimationState:function(){o=[],this.options.animation&&[].slice.call(this.el.children).forEach(function(t){var e,n;"none"!==R(t,"display")&&t!==Ht.ghost&&(o.push({target:t,rect:X(t)}),e=I({},o[o.length-1].rect),!t.thisAnimationDuration||(n=D(t,!0))&&(e.top-=n.f,e.left-=n.e),t.fromRect=e)})},addAnimationState:function(t){o.push(t)},removeAnimationState:function(t){o.splice(function(t,e){for(var n in t)if(t.hasOwnProperty(n))for(var o in e)if(e.hasOwnProperty(o)&&e[o]===t[n][o])return Number(n);return-1}(o,{target:t}),1)},animateAll:function(t){var c=this;if(!this.options.animation)return clearTimeout(e),void("function"==typeof t&&t());var u=!1,d=0;o.forEach(function(t){var e=0,n=t.target,o=n.fromRect,i=X(n),r=n.prevFromRect,a=n.prevToRect,l=t.rect,s=D(n,!0);s&&(i.top-=s.f,i.left-=s.e),n.toRect=i,n.thisAnimationDuration&&_(r,i)&&!_(o,i)&&(l.top-i.top)/(l.left-i.left)==(o.top-i.top)/(o.left-i.left)&&(t=l,s=r,r=a,a=c.options,e=Math.sqrt(Math.pow(s.top-t.top,2)+Math.pow(s.left-t.left,2))/Math.sqrt(Math.pow(s.top-r.top,2)+Math.pow(s.left-r.left,2))*a.animation),_(i,o)||(n.prevFromRect=o,n.prevToRect=i,e=e||c.options.animation,c.animate(n,l,i,e)),e&&(u=!0,d=Math.max(d,e),clearTimeout(n.animationResetTimer),n.animationResetTimer=setTimeout(function(){n.animationTime=0,n.prevFromRect=null,n.fromRect=null,n.prevToRect=null,n.thisAnimationDuration=null},e),n.thisAnimationDuration=e)}),clearTimeout(e),u?e=setTimeout(function(){"function"==typeof t&&t()},d):"function"==typeof t&&t(),o=[]},animate:function(t,e,n,o){var i,r;o&&(R(t,"transition",""),R(t,"transform",""),i=(r=D(this.el))&&r.a,r=r&&r.d,i=(e.left-n.left)/(i||1),r=(e.top-n.top)/(r||1),t.animatingX=!!i,t.animatingY=!!r,R(t,"transform","translate3d("+i+"px,"+r+"px,0)"),this.forRepaintDummy=t.offsetWidth,R(t,"transition","transform "+o+"ms"+(this.options.easing?" "+this.options.easing:"")),R(t,"transform","translate3d(0,0,0)"),"number"==typeof t.animated&&clearTimeout(t.animated),t.animated=setTimeout(function(){R(t,"transition",""),R(t,"transform",""),t.animated=!1,t.animatingX=!1,t.animatingY=!1},o))}}}var W=[],z={initializeByDefault:!0},G={mount:function(e){for(var t in z)!z.hasOwnProperty(t)||t in e||(e[t]=z[t]);W.forEach(function(t){if(t.pluginName===e.pluginName)throw"Sortable: Cannot mount plugin ".concat(e.pluginName," more than once")}),W.push(e)},pluginEvent:function(e,n,o){var t=this;this.eventCanceled=!1,o.cancel=function(){t.eventCanceled=!0};var i=e+"Global";W.forEach(function(t){n[t.pluginName]&&(n[t.pluginName][i]&&n[t.pluginName][i](I({sortable:n},o)),n.options[t.pluginName]&&n[t.pluginName][e]&&n[t.pluginName][e](I({sortable:n},o)))})},initializePlugins:function(n,o,i,t){for(var e in W.forEach(function(t){var e=t.pluginName;(n.options[e]||t.initializeByDefault)&&((t=new t(n,o,n.options)).sortable=n,t.options=n.options,n[e]=t,a(i,t.defaults))}),n.options){var r;n.options.hasOwnProperty(e)&&(void 0!==(r=this.modifyOption(n,e,n.options[e]))&&(n.options[e]=r))}},getEventProperties:function(e,n){var o={};return W.forEach(function(t){"function"==typeof t.eventProperties&&a(o,t.eventProperties.call(n[t.pluginName],e))}),o},modifyOption:function(e,n,o){var i;return W.forEach(function(t){e[t.pluginName]&&t.optionListeners&&"function"==typeof t.optionListeners[n]&&(i=t.optionListeners[n].call(e[t.pluginName],o))}),i}};function U(t){var e=t.sortable,n=t.rootEl,o=t.name,i=t.targetEl,r=t.cloneEl,a=t.toEl,l=t.fromEl,s=t.oldIndex,c=t.newIndex,u=t.oldDraggableIndex,d=t.newDraggableIndex,h=t.originalEvent,f=t.putSortable,p=t.extraEventProperties;if(e=e||n&&n[K]){var g,m=e.options,t="on"+o.charAt(0).toUpperCase()+o.substr(1);!window.CustomEvent||y||w?(g=document.createEvent("Event")).initEvent(o,!0,!0):g=new CustomEvent(o,{bubbles:!0,cancelable:!0}),g.to=a||n,g.from=l||n,g.item=i||n,g.clone=r,g.oldIndex=s,g.newIndex=c,g.oldDraggableIndex=u,g.newDraggableIndex=d,g.originalEvent=h,g.pullMode=f?f.lastPutMode:void 0;var v,b=I(I({},p),G.getEventProperties(o,e));for(v in b)g[v]=b[v];n&&n.dispatchEvent(g),m[t]&&m[t].call(e,g)}}function q(t,e){var n=(o=2<arguments.length&&void 0!==arguments[2]?arguments[2]:{}).evt,o=l(o,V);G.pluginEvent.bind(Ht)(t,e,I({dragEl:$,parentEl:Q,ghostEl:J,rootEl:tt,nextEl:et,lastDownEl:nt,cloneEl:ot,cloneHidden:it,dragStarted:vt,putSortable:ut,activeSortable:Ht.active,originalEvent:n,oldIndex:rt,oldDraggableIndex:lt,newIndex:at,newDraggableIndex:st,hideGhostForTarget:Yt,unhideGhostForTarget:Bt,cloneNowHidden:function(){it=!0},cloneNowShown:function(){it=!1},dispatchSortableEvent:function(t){Z({sortable:e,name:t,originalEvent:n})}},o))}var V=["evt"];function Z(t){U(I({putSortable:ut,cloneEl:ot,targetEl:$,rootEl:tt,oldIndex:rt,oldDraggableIndex:lt,newIndex:at,newDraggableIndex:st},t))}var $,Q,J,tt,et,nt,ot,it,rt,at,lt,st,ct,ut,dt,ht,ft,pt,gt,mt,vt,bt,yt,wt,Dt,Et=!1,St=!1,_t=[],Ct=!1,Tt=!1,xt=[],Ot=!1,Mt=[],At="undefined"!=typeof document,Nt=d,It=w||y?"cssFloat":"float",Pt=At&&!n&&!d&&"draggable"in document.createElement("div"),kt=function(){if(At){if(y)return!1;var t=document.createElement("x");return t.style.cssText="pointer-events:auto","auto"===t.style.pointerEvents}}(),Rt=function(t,e){var n=R(t),o=parseInt(n.width)-parseInt(n.paddingLeft)-parseInt(n.paddingRight)-parseInt(n.borderLeftWidth)-parseInt(n.borderRightWidth),i=B(t,0,e),r=B(t,1,e),a=i&&R(i),l=r&&R(r),s=a&&parseInt(a.marginLeft)+parseInt(a.marginRight)+X(i).width,t=l&&parseInt(l.marginLeft)+parseInt(l.marginRight)+X(r).width;if("flex"===n.display)return"column"===n.flexDirection||"column-reverse"===n.flexDirection?"vertical":"horizontal";if("grid"===n.display)return n.gridTemplateColumns.split(" ").length<=1?"vertical":"horizontal";if(i&&a.float&&"none"!==a.float){e="left"===a.float?"left":"right";return!r||"both"!==l.clear&&l.clear!==e?"horizontal":"vertical"}return i&&("block"===a.display||"flex"===a.display||"table"===a.display||"grid"===a.display||o<=s&&"none"===n[It]||r&&"none"===n[It]&&o<s+t)?"vertical":"horizontal"},Xt=function(t){function l(r,a){return function(t,e,n,o){var i=t.options.group.name&&e.options.group.name&&t.options.group.name===e.options.group.name;if(null==r&&(a||i))return!0;if(null==r||!1===r)return!1;if(a&&"clone"===r)return r;if("function"==typeof r)return l(r(t,e,n,o),a)(t,e,n,o);e=(a?t:e).options.group.name;return!0===r||"string"==typeof r&&r===e||r.join&&-1<r.indexOf(e)}}var e={},n=t.group;n&&"object"==s(n)||(n={name:n}),e.name=n.name,e.checkPull=l(n.pull,!0),e.checkPut=l(n.put),e.revertClone=n.revertClone,t.group=e},Yt=function(){!kt&&J&&R(J,"display","none")},Bt=function(){!kt&&J&&R(J,"display","")};At&&!n&&document.addEventListener("click",function(t){if(St)return t.preventDefault(),t.stopPropagation&&t.stopPropagation(),t.stopImmediatePropagation&&t.stopImmediatePropagation(),St=!1},!0);function Ft(t){if($){t=t.touches?t.touches[0]:t;var e=(i=t.clientX,r=t.clientY,_t.some(function(t){var e=t[K].options.emptyInsertThreshold;if(e&&!F(t)){var n=X(t),o=i>=n.left-e&&i<=n.right+e,e=r>=n.top-e&&r<=n.bottom+e;return o&&e?a=t:void 0}}),a);if(e){var n,o={};for(n in t)t.hasOwnProperty(n)&&(o[n]=t[n]);o.target=o.rootEl=e,o.preventDefault=void 0,o.stopPropagation=void 0,e[K]._onDragOver(o)}}var i,r,a}function jt(t){$&&$.parentNode[K]._isOutsideThisEl(t.target)}function Ht(t,e){if(!t||!t.nodeType||1!==t.nodeType)throw"Sortable: `el` must be an HTMLElement, not ".concat({}.toString.call(t));this.el=t,this.options=e=a({},e),t[K]=this;var n,o,i={group:null,sort:!0,disabled:!1,store:null,handle:null,draggable:/^[uo]l$/i.test(t.nodeName)?">li":">*",swapThreshold:1,invertSwap:!1,invertedSwapThreshold:null,removeCloneOnHide:!0,direction:function(){return Rt(t,this.options)},ghostClass:"sortable-ghost",chosenClass:"sortable-chosen",dragClass:"sortable-drag",ignore:"a, img",filter:null,preventOnFilter:!0,animation:0,easing:null,setData:function(t,e){t.setData("Text",e.textContent)},dropBubble:!1,dragoverBubble:!1,dataIdAttr:"data-id",delay:0,delayOnTouchOnly:!1,touchStartThreshold:(Number.parseInt?Number:window).parseInt(window.devicePixelRatio,10)||1,forceFallback:!1,fallbackClass:"sortable-fallback",fallbackOnBody:!1,fallbackTolerance:0,fallbackOffset:{x:0,y:0},supportPointer:!1!==Ht.supportPointer&&"PointerEvent"in window&&(!u||d),emptyInsertThreshold:5};for(n in G.initializePlugins(this,t,i),i)n in e||(e[n]=i[n]);for(o in Xt(e),this)"_"===o.charAt(0)&&"function"==typeof this[o]&&(this[o]=this[o].bind(this));this.nativeDraggable=!e.forceFallback&&Pt,this.nativeDraggable&&(this.options.touchStartThreshold=1),e.supportPointer?f(t,"pointerdown",this._onTapStart):(f(t,"mousedown",this._onTapStart),f(t,"touchstart",this._onTapStart)),this.nativeDraggable&&(f(t,"dragover",this),f(t,"dragenter",this)),_t.push(this.el),e.store&&e.store.get&&this.sort(e.store.get(this)||[]),a(this,N())}function Lt(t,e,n,o,i,r,a,l){var s,c,u=t[K],d=u.options.onMove;return!window.CustomEvent||y||w?(s=document.createEvent("Event")).initEvent("move",!0,!0):s=new CustomEvent("move",{bubbles:!0,cancelable:!0}),s.to=e,s.from=t,s.dragged=n,s.draggedRect=o,s.related=i||e,s.relatedRect=r||X(e),s.willInsertAfter=l,s.originalEvent=a,t.dispatchEvent(s),c=d?d.call(u,s,a):c}function Kt(t){t.draggable=!1}function Wt(){Ot=!1}function zt(t){return setTimeout(t,0)}function Gt(t){return clearTimeout(t)}Ht.prototype={constructor:Ht,_isOutsideThisEl:function(t){this.el.contains(t)||t===this.el||(bt=null)},_getDirection:function(t,e){return"function"==typeof this.options.direction?this.options.direction.call(this,t,e,$):this.options.direction},_onTapStart:function(e){if(e.cancelable){var n=this,o=this.el,t=this.options,i=t.preventOnFilter,r=e.type,a=e.touches&&e.touches[0]||e.pointerType&&"touch"===e.pointerType&&e,l=(a||e).target,s=e.target.shadowRoot&&(e.path&&e.path[0]||e.composedPath&&e.composedPath()[0])||l,c=t.filter;if(!function(t){Mt.length=0;var e=t.getElementsByTagName("input"),n=e.length;for(;n--;){var o=e[n];o.checked&&Mt.push(o)}}(o),!$&&!(/mousedown|pointerdown/.test(r)&&0!==e.button||t.disabled)&&!s.isContentEditable&&(this.nativeDraggable||!u||!l||"SELECT"!==l.tagName.toUpperCase())&&!((l=P(l,t.draggable,o,!1))&&l.animated||nt===l)){if(rt=j(l),lt=j(l,t.draggable),"function"==typeof c){if(c.call(this,e,l,this))return Z({sortable:n,rootEl:s,name:"filter",targetEl:l,toEl:o,fromEl:o}),q("filter",n,{evt:e}),void(i&&e.preventDefault())}else if(c=c&&c.split(",").some(function(t){if(t=P(s,t.trim(),o,!1))return Z({sortable:n,rootEl:t,name:"filter",targetEl:l,fromEl:o,toEl:o}),q("filter",n,{evt:e}),!0}))return void(i&&e.preventDefault());t.handle&&!P(s,t.handle,o,!1)||this._prepareDragStart(e,a,l)}}},_prepareDragStart:function(t,e,n){var o,i=this,r=i.el,a=i.options,l=r.ownerDocument;n&&!$&&n.parentNode===r&&(o=X(n),tt=r,Q=($=n).parentNode,et=$.nextSibling,nt=n,ct=a.group,dt={target:Ht.dragged=$,clientX:(e||t).clientX,clientY:(e||t).clientY},gt=dt.clientX-o.left,mt=dt.clientY-o.top,this._lastX=(e||t).clientX,this._lastY=(e||t).clientY,$.style["will-change"]="all",o=function(){q("delayEnded",i,{evt:t}),Ht.eventCanceled?i._onDrop():(i._disableDelayedDragEvents(),!c&&i.nativeDraggable&&($.draggable=!0),i._triggerDragStart(t,e),Z({sortable:i,name:"choose",originalEvent:t}),k($,a.chosenClass,!0))},a.ignore.split(",").forEach(function(t){E($,t.trim(),Kt)}),f(l,"dragover",Ft),f(l,"mousemove",Ft),f(l,"touchmove",Ft),a.supportPointer?(f(l,"pointerup",i._onDrop),this.nativeDraggable||f(l,"pointercancel",i._onDrop)):(f(l,"mouseup",i._onDrop),f(l,"touchend",i._onDrop),f(l,"touchcancel",i._onDrop)),c&&this.nativeDraggable&&(this.options.touchStartThreshold=4,$.draggable=!0),q("delayStart",this,{evt:t}),!a.delay||a.delayOnTouchOnly&&!e||this.nativeDraggable&&(w||y)?o():Ht.eventCanceled?this._onDrop():(a.supportPointer?(f(l,"pointerup",i._disableDelayedDrag),f(l,"pointercancel",i._disableDelayedDrag)):(f(l,"mouseup",i._disableDelayedDrag),f(l,"touchend",i._disableDelayedDrag),f(l,"touchcancel",i._disableDelayedDrag)),f(l,"mousemove",i._delayedDragTouchMoveHandler),f(l,"touchmove",i._delayedDragTouchMoveHandler),a.supportPointer&&f(l,"pointermove",i._delayedDragTouchMoveHandler),i._dragStartTimer=setTimeout(o,a.delay)))},_delayedDragTouchMoveHandler:function(t){t=t.touches?t.touches[0]:t;Math.max(Math.abs(t.clientX-this._lastX),Math.abs(t.clientY-this._lastY))>=Math.floor(this.options.touchStartThreshold/(this.nativeDraggable&&window.devicePixelRatio||1))&&this._disableDelayedDrag()},_disableDelayedDrag:function(){$&&Kt($),clearTimeout(this._dragStartTimer),this._disableDelayedDragEvents()},_disableDelayedDragEvents:function(){var t=this.el.ownerDocument;p(t,"mouseup",this._disableDelayedDrag),p(t,"touchend",this._disableDelayedDrag),p(t,"touchcancel",this._disableDelayedDrag),p(t,"pointerup",this._disableDelayedDrag),p(t,"pointercancel",this._disableDelayedDrag),p(t,"mousemove",this._delayedDragTouchMoveHandler),p(t,"touchmove",this._delayedDragTouchMoveHandler),p(t,"pointermove",this._delayedDragTouchMoveHandler)},_triggerDragStart:function(t,e){e=e||"touch"==t.pointerType&&t,!this.nativeDraggable||e?this.options.supportPointer?f(document,"pointermove",this._onTouchMove):f(document,e?"touchmove":"mousemove",this._onTouchMove):(f($,"dragend",this),f(tt,"dragstart",this._onDragStart));try{document.selection?zt(function(){document.selection.empty()}):window.getSelection().removeAllRanges()}catch(t){}},_dragStarted:function(t,e){var n;Et=!1,tt&&$?(q("dragStarted",this,{evt:e}),this.nativeDraggable&&f(document,"dragover",jt),n=this.options,t||k($,n.dragClass,!1),k($,n.ghostClass,!0),Ht.active=this,t&&this._appendGhost(),Z({sortable:this,name:"start",originalEvent:e})):this._nulling()},_emulateDragOver:function(){if(ht){this._lastX=ht.clientX,this._lastY=ht.clientY,Yt();for(var t=document.elementFromPoint(ht.clientX,ht.clientY),e=t;t&&t.shadowRoot&&(t=t.shadowRoot.elementFromPoint(ht.clientX,ht.clientY))!==e;)e=t;if($.parentNode[K]._isOutsideThisEl(t),e)do{if(e[K])if(e[K]._onDragOver({clientX:ht.clientX,clientY:ht.clientY,target:t,rootEl:e})&&!this.options.dragoverBubble)break}while(e=m(t=e));Bt()}},_onTouchMove:function(t){if(dt){var e=this.options,n=e.fallbackTolerance,o=e.fallbackOffset,i=t.touches?t.touches[0]:t,r=J&&D(J,!0),a=J&&r&&r.a,l=J&&r&&r.d,e=Nt&&Dt&&S(Dt),a=(i.clientX-dt.clientX+o.x)/(a||1)+(e?e[0]-xt[0]:0)/(a||1),l=(i.clientY-dt.clientY+o.y)/(l||1)+(e?e[1]-xt[1]:0)/(l||1);if(!Ht.active&&!Et){if(n&&Math.max(Math.abs(i.clientX-this._lastX),Math.abs(i.clientY-this._lastY))<n)return;this._onDragStart(t,!0)}J&&(r?(r.e+=a-(ft||0),r.f+=l-(pt||0)):r={a:1,b:0,c:0,d:1,e:a,f:l},r="matrix(".concat(r.a,",").concat(r.b,",").concat(r.c,",").concat(r.d,",").concat(r.e,",").concat(r.f,")"),R(J,"webkitTransform",r),R(J,"mozTransform",r),R(J,"msTransform",r),R(J,"transform",r),ft=a,pt=l,ht=i),t.cancelable&&t.preventDefault()}},_appendGhost:function(){if(!J){var t=this.options.fallbackOnBody?document.body:tt,e=X($,!0,Nt,!0,t),n=this.options;if(Nt){for(Dt=t;"static"===R(Dt,"position")&&"none"===R(Dt,"transform")&&Dt!==document;)Dt=Dt.parentNode;Dt!==document.body&&Dt!==document.documentElement?(Dt===document&&(Dt=O()),e.top+=Dt.scrollTop,e.left+=Dt.scrollLeft):Dt=O(),xt=S(Dt)}k(J=$.cloneNode(!0),n.ghostClass,!1),k(J,n.fallbackClass,!0),k(J,n.dragClass,!0),R(J,"transition",""),R(J,"transform",""),R(J,"box-sizing","border-box"),R(J,"margin",0),R(J,"top",e.top),R(J,"left",e.left),R(J,"width",e.width),R(J,"height",e.height),R(J,"opacity","0.8"),R(J,"position",Nt?"absolute":"fixed"),R(J,"zIndex","100000"),R(J,"pointerEvents","none"),Ht.ghost=J,t.appendChild(J),R(J,"transform-origin",gt/parseInt(J.style.width)*100+"% "+mt/parseInt(J.style.height)*100+"%")}},_onDragStart:function(t,e){var n=this,o=t.dataTransfer,i=n.options;q("dragStart",this,{evt:t}),Ht.eventCanceled?this._onDrop():(q("setupClone",this),Ht.eventCanceled||((ot=T($)).removeAttribute("id"),ot.draggable=!1,ot.style["will-change"]="",this._hideClone(),k(ot,this.options.chosenClass,!1),Ht.clone=ot),n.cloneId=zt(function(){q("clone",n),Ht.eventCanceled||(n.options.removeCloneOnHide||tt.insertBefore(ot,$),n._hideClone(),Z({sortable:n,name:"clone"}))}),e||k($,i.dragClass,!0),e?(St=!0,n._loopId=setInterval(n._emulateDragOver,50)):(p(document,"mouseup",n._onDrop),p(document,"touchend",n._onDrop),p(document,"touchcancel",n._onDrop),o&&(o.effectAllowed="move",i.setData&&i.setData.call(n,o,$)),f(document,"drop",n),R($,"transform","translateZ(0)")),Et=!0,n._dragStartId=zt(n._dragStarted.bind(n,e,t)),f(document,"selectstart",n),vt=!0,window.getSelection().removeAllRanges(),u&&R(document.body,"user-select","none"))},_onDragOver:function(n){var o,i,r,t,e,a=this.el,l=n.target,s=this.options,c=s.group,u=Ht.active,d=ct===c,h=s.sort,f=ut||u,p=this,g=!1;if(!Ot){if(void 0!==n.preventDefault&&n.cancelable&&n.preventDefault(),l=P(l,s.draggable,a,!0),O("dragOver"),Ht.eventCanceled)return g;if($.contains(n.target)||l.animated&&l.animatingX&&l.animatingY||p._ignoreWhileAnimating===l)return A(!1);if(St=!1,u&&!s.disabled&&(d?h||(i=Q!==tt):ut===this||(this.lastPutMode=ct.checkPull(this,u,$,n))&&c.checkPut(this,u,$,n))){if(r="vertical"===this._getDirection(n,l),o=X($),O("dragOverValid"),Ht.eventCanceled)return g;if(i)return Q=tt,M(),this._hideClone(),O("revert"),Ht.eventCanceled||(et?tt.insertBefore($,et):tt.appendChild($)),A(!0);var m=F(a,s.draggable);if(m&&(S=n,c=r,x=X(F((E=this).el,E.options.draggable)),E=L(E.el,E.options,J),!(c?S.clientX>E.right+10||S.clientY>x.bottom&&S.clientX>x.left:S.clientY>E.bottom+10||S.clientX>x.right&&S.clientY>x.top)||m.animated)){if(m&&(t=n,e=r,C=X(B((_=this).el,0,_.options,!0)),_=L(_.el,_.options,J),e?t.clientX<_.left-10||t.clientY<C.top&&t.clientX<C.right:t.clientY<_.top-10||t.clientY<C.bottom&&t.clientX<C.left)){var v=B(a,0,s,!0);if(v===$)return A(!1);if(D=X(l=v),!1!==Lt(tt,a,$,o,l,D,n,!1))return M(),a.insertBefore($,v),Q=a,N(),A(!0)}else if(l.parentNode===a){var b,y,w,D=X(l),E=$.parentNode!==a,S=(S=$.animated&&$.toRect||o,x=l.animated&&l.toRect||D,_=(e=r)?S.left:S.top,t=e?S.right:S.bottom,C=e?S.width:S.height,v=e?x.left:x.top,S=e?x.right:x.bottom,x=e?x.width:x.height,!(_===v||t===S||_+C/2===v+x/2)),_=r?"top":"left",C=Y(l,"top","top")||Y($,"top","top"),v=C?C.scrollTop:void 0;if(bt!==l&&(y=D[_],Ct=!1,Tt=!S&&s.invertSwap||E),0!==(b=function(t,e,n,o,i,r,a,l){var s=o?t.clientY:t.clientX,c=o?n.height:n.width,t=o?n.top:n.left,o=o?n.bottom:n.right,n=!1;if(!a)if(l&&wt<c*i){if(Ct=!Ct&&(1===yt?t+c*r/2<s:s<o-c*r/2)?!0:Ct)n=!0;else if(1===yt?s<t+wt:o-wt<s)return-yt}else if(t+c*(1-i)/2<s&&s<o-c*(1-i)/2)return function(t){return j($)<j(t)?1:-1}(e);if((n=n||a)&&(s<t+c*r/2||o-c*r/2<s))return t+c/2<s?1:-1;return 0}(n,l,D,r,S?1:s.swapThreshold,null==s.invertedSwapThreshold?s.swapThreshold:s.invertedSwapThreshold,Tt,bt===l)))for(var T=j($);(w=Q.children[T-=b])&&("none"===R(w,"display")||w===J););if(0===b||w===l)return A(!1);yt=b;var x=(bt=l).nextElementSibling,E=!1,S=Lt(tt,a,$,o,l,D,n,E=1===b);if(!1!==S)return 1!==S&&-1!==S||(E=1===S),Ot=!0,setTimeout(Wt,30),M(),E&&!x?a.appendChild($):l.parentNode.insertBefore($,E?x:l),C&&H(C,0,v-C.scrollTop),Q=$.parentNode,void 0===y||Tt||(wt=Math.abs(y-X(l)[_])),N(),A(!0)}}else{if(m===$)return A(!1);if((l=m&&a===n.target?m:l)&&(D=X(l)),!1!==Lt(tt,a,$,o,l,D,n,!!l))return M(),m&&m.nextSibling?a.insertBefore($,m.nextSibling):a.appendChild($),Q=a,N(),A(!0)}if(a.contains($))return A(!1)}return!1}function O(t,e){q(t,p,I({evt:n,isOwner:d,axis:r?"vertical":"horizontal",revert:i,dragRect:o,targetRect:D,canSort:h,fromSortable:f,target:l,completed:A,onMove:function(t,e){return Lt(tt,a,$,o,t,X(t),n,e)},changed:N},e))}function M(){O("dragOverAnimationCapture"),p.captureAnimationState(),p!==f&&f.captureAnimationState()}function A(t){return O("dragOverCompleted",{insertion:t}),t&&(d?u._hideClone():u._showClone(p),p!==f&&(k($,(ut||u).options.ghostClass,!1),k($,s.ghostClass,!0)),ut!==p&&p!==Ht.active?ut=p:p===Ht.active&&ut&&(ut=null),f===p&&(p._ignoreWhileAnimating=l),p.animateAll(function(){O("dragOverAnimationComplete"),p._ignoreWhileAnimating=null}),p!==f&&(f.animateAll(),f._ignoreWhileAnimating=null)),(l===$&&!$.animated||l===a&&!l.animated)&&(bt=null),s.dragoverBubble||n.rootEl||l===document||($.parentNode[K]._isOutsideThisEl(n.target),t||Ft(n)),!s.dragoverBubble&&n.stopPropagation&&n.stopPropagation(),g=!0}function N(){at=j($),st=j($,s.draggable),Z({sortable:p,name:"change",toEl:a,newIndex:at,newDraggableIndex:st,originalEvent:n})}},_ignoreWhileAnimating:null,_offMoveEvents:function(){p(document,"mousemove",this._onTouchMove),p(document,"touchmove",this._onTouchMove),p(document,"pointermove",this._onTouchMove),p(document,"dragover",Ft),p(document,"mousemove",Ft),p(document,"touchmove",Ft)},_offUpEvents:function(){var t=this.el.ownerDocument;p(t,"mouseup",this._onDrop),p(t,"touchend",this._onDrop),p(t,"pointerup",this._onDrop),p(t,"pointercancel",this._onDrop),p(t,"touchcancel",this._onDrop),p(document,"selectstart",this)},_onDrop:function(t){var e=this.el,n=this.options;at=j($),st=j($,n.draggable),q("drop",this,{evt:t}),Q=$&&$.parentNode,at=j($),st=j($,n.draggable),Ht.eventCanceled||(Ct=Tt=Et=!1,clearInterval(this._loopId),clearTimeout(this._dragStartTimer),Gt(this.cloneId),Gt(this._dragStartId),this.nativeDraggable&&(p(document,"drop",this),p(e,"dragstart",this._onDragStart)),this._offMoveEvents(),this._offUpEvents(),u&&R(document.body,"user-select",""),R($,"transform",""),t&&(vt&&(t.cancelable&&t.preventDefault(),n.dropBubble||t.stopPropagation()),J&&J.parentNode&&J.parentNode.removeChild(J),(tt===Q||ut&&"clone"!==ut.lastPutMode)&&ot&&ot.parentNode&&ot.parentNode.removeChild(ot),$&&(this.nativeDraggable&&p($,"dragend",this),Kt($),$.style["will-change"]="",vt&&!Et&&k($,(ut||this).options.ghostClass,!1),k($,this.options.chosenClass,!1),Z({sortable:this,name:"unchoose",toEl:Q,newIndex:null,newDraggableIndex:null,originalEvent:t}),tt!==Q?(0<=at&&(Z({rootEl:Q,name:"add",toEl:Q,fromEl:tt,originalEvent:t}),Z({sortable:this,name:"remove",toEl:Q,originalEvent:t}),Z({rootEl:Q,name:"sort",toEl:Q,fromEl:tt,originalEvent:t}),Z({sortable:this,name:"sort",toEl:Q,originalEvent:t})),ut&&ut.save()):at!==rt&&0<=at&&(Z({sortable:this,name:"update",toEl:Q,originalEvent:t}),Z({sortable:this,name:"sort",toEl:Q,originalEvent:t})),Ht.active&&(null!=at&&-1!==at||(at=rt,st=lt),Z({sortable:this,name:"end",toEl:Q,originalEvent:t}),this.save())))),this._nulling()},_nulling:function(){q("nulling",this),tt=$=Q=J=et=ot=nt=it=dt=ht=vt=at=st=rt=lt=bt=yt=ut=ct=Ht.dragged=Ht.ghost=Ht.clone=Ht.active=null;var e=this.el;Mt.forEach(function(t){e.contains(t)&&(t.checked=!0)}),Mt.length=ft=pt=0},handleEvent:function(t){switch(t.type){case"drop":case"dragend":this._onDrop(t);break;case"dragenter":case"dragover":$&&(this._onDragOver(t),function(t){t.dataTransfer&&(t.dataTransfer.dropEffect="move");t.cancelable&&t.preventDefault()}(t));break;case"selectstart":t.preventDefault()}},toArray:function(){for(var t,e=[],n=this.el.children,o=0,i=n.length,r=this.options;o<i;o++)P(t=n[o],r.draggable,this.el,!1)&&e.push(t.getAttribute(r.dataIdAttr)||function(t){var e=t.tagName+t.className+t.src+t.href+t.textContent,n=e.length,o=0;for(;n--;)o+=e.charCodeAt(n);return o.toString(36)}(t));return e},sort:function(t,e){var n={},o=this.el;this.toArray().forEach(function(t,e){e=o.children[e];P(e,this.options.draggable,o,!1)&&(n[t]=e)},this),e&&this.captureAnimationState(),t.forEach(function(t){n[t]&&(o.removeChild(n[t]),o.appendChild(n[t]))}),e&&this.animateAll()},save:function(){var t=this.options.store;t&&t.set&&t.set(this)},closest:function(t,e){return P(t,e||this.options.draggable,this.el,!1)},option:function(t,e){var n=this.options;if(void 0===e)return n[t];var o=G.modifyOption(this,t,e);n[t]=void 0!==o?o:e,"group"===t&&Xt(n)},destroy:function(){q("destroy",this);var t=this.el;t[K]=null,p(t,"mousedown",this._onTapStart),p(t,"touchstart",this._onTapStart),p(t,"pointerdown",this._onTapStart),this.nativeDraggable&&(p(t,"dragover",this),p(t,"dragenter",this)),Array.prototype.forEach.call(t.querySelectorAll("[draggable]"),function(t){t.removeAttribute("draggable")}),this._onDrop(),this._disableDelayedDragEvents(),_t.splice(_t.indexOf(this.el),1),this.el=t=null},_hideClone:function(){it||(q("hideClone",this),Ht.eventCanceled||(R(ot,"display","none"),this.options.removeCloneOnHide&&ot.parentNode&&ot.parentNode.removeChild(ot),it=!0))},_showClone:function(t){"clone"===t.lastPutMode?it&&(q("showClone",this),Ht.eventCanceled||($.parentNode!=tt||this.options.group.revertClone?et?tt.insertBefore(ot,et):tt.appendChild(ot):tt.insertBefore(ot,$),this.options.group.revertClone&&this.animate($,ot),R(ot,"display",""),it=!1)):this._hideClone()}},At&&f(document,"touchmove",function(t){(Ht.active||Et)&&t.cancelable&&t.preventDefault()}),Ht.utils={on:f,off:p,css:R,find:E,is:function(t,e){return!!P(t,e,t,!1)},extend:function(t,e){if(t&&e)for(var n in e)e.hasOwnProperty(n)&&(t[n]=e[n]);return t},throttle:C,closest:P,toggleClass:k,clone:T,index:j,nextTick:zt,cancelNextTick:Gt,detectDirection:Rt,getChild:B,expando:K},Ht.get=function(t){return t[K]},Ht.mount=function(){for(var t=arguments.length,e=new Array(t),n=0;n<t;n++)e[n]=arguments[n];(e=e[0].constructor===Array?e[0]:e).forEach(function(t){if(!t.prototype||!t.prototype.constructor)throw"Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(t));t.utils&&(Ht.utils=I(I({},Ht.utils),t.utils)),G.mount(t)})},Ht.create=function(t,e){return new Ht(t,e)};var Ut,qt,Vt,Zt,$t,Qt,Jt=[],te=!(Ht.version="1.15.7");function ee(){Jt.forEach(function(t){clearInterval(t.pid)}),Jt=[]}function ne(){clearInterval(Qt)}var oe,ie=C(function(n,t,e,o){if(t.scroll){var i,r=(n.touches?n.touches[0]:n).clientX,a=(n.touches?n.touches[0]:n).clientY,l=t.scrollSensitivity,s=t.scrollSpeed,c=O(),u=!1;qt!==e&&(qt=e,ee(),Ut=t.scroll,i=t.scrollFn,!0===Ut&&(Ut=M(e,!0)));var d=0,h=Ut;do{var f=h,p=X(f),g=p.top,m=p.bottom,v=p.left,b=p.right,y=p.width,w=p.height,D=void 0,E=void 0,S=f.scrollWidth,_=f.scrollHeight,C=R(f),T=f.scrollLeft,p=f.scrollTop,E=f===c?(D=y<S&&("auto"===C.overflowX||"scroll"===C.overflowX||"visible"===C.overflowX),w<_&&("auto"===C.overflowY||"scroll"===C.overflowY||"visible"===C.overflowY)):(D=y<S&&("auto"===C.overflowX||"scroll"===C.overflowX),w<_&&("auto"===C.overflowY||"scroll"===C.overflowY)),T=D&&(Math.abs(b-r)<=l&&T+y<S)-(Math.abs(v-r)<=l&&!!T),p=E&&(Math.abs(m-a)<=l&&p+w<_)-(Math.abs(g-a)<=l&&!!p);if(!Jt[d])for(var x=0;x<=d;x++)Jt[x]||(Jt[x]={});Jt[d].vx==T&&Jt[d].vy==p&&Jt[d].el===f||(Jt[d].el=f,Jt[d].vx=T,Jt[d].vy=p,clearInterval(Jt[d].pid),0==T&&0==p||(u=!0,Jt[d].pid=setInterval(function(){o&&0===this.layer&&Ht.active._onTouchMove($t);var t=Jt[this.layer].vy?Jt[this.layer].vy*s:0,e=Jt[this.layer].vx?Jt[this.layer].vx*s:0;"function"==typeof i&&"continue"!==i.call(Ht.dragged.parentNode[K],e,t,n,$t,Jt[this.layer].el)||H(Jt[this.layer].el,e,t)}.bind({layer:d}),24))),d++}while(t.bubbleScroll&&h!==c&&(h=M(h,!1)));te=u}},30),n=function(t){var e=t.originalEvent,n=t.putSortable,o=t.dragEl,i=t.activeSortable,r=t.dispatchSortableEvent,a=t.hideGhostForTarget,t=t.unhideGhostForTarget;e&&(i=n||i,a(),e=e.changedTouches&&e.changedTouches.length?e.changedTouches[0]:e,e=document.elementFromPoint(e.clientX,e.clientY),t(),i&&!i.el.contains(e)&&(r("spill"),this.onSpill({dragEl:o,putSortable:n})))};function re(){}function ae(){}re.prototype={startIndex:null,dragStart:function(t){t=t.oldDraggableIndex;this.startIndex=t},onSpill:function(t){var e=t.dragEl,n=t.putSortable;this.sortable.captureAnimationState(),n&&n.captureAnimationState();t=B(this.sortable.el,this.startIndex,this.options);t?this.sortable.el.insertBefore(e,t):this.sortable.el.appendChild(e),this.sortable.animateAll(),n&&n.animateAll()},drop:n},a(re,{pluginName:"revertOnSpill"}),ae.prototype={onSpill:function(t){var e=t.dragEl,t=t.putSortable||this.sortable;t.captureAnimationState(),e.parentNode&&e.parentNode.removeChild(e),t.animateAll()},drop:n},a(ae,{pluginName:"removeOnSpill"});var le,se,ce,ue,de,he=[],fe=[],pe=!1,ge=!1,me=!1;function ve(n,o){fe.forEach(function(t,e){e=o.children[t.sortableIndex+(n?Number(e):0)];e?o.insertBefore(t,e):o.appendChild(t)})}function be(){he.forEach(function(t){t!==ce&&t.parentNode&&t.parentNode.removeChild(t)})}return Ht.mount(new function(){function t(){for(var t in this.defaults={scroll:!0,forceAutoScrollFallback:!1,scrollSensitivity:30,scrollSpeed:10,bubbleScroll:!0},this)"_"===t.charAt(0)&&"function"==typeof this[t]&&(this[t]=this[t].bind(this))}return t.prototype={dragStarted:function(t){t=t.originalEvent;this.sortable.nativeDraggable?f(document,"dragover",this._handleAutoScroll):this.options.supportPointer?f(document,"pointermove",this._handleFallbackAutoScroll):t.touches?f(document,"touchmove",this._handleFallbackAutoScroll):f(document,"mousemove",this._handleFallbackAutoScroll)},dragOverCompleted:function(t){t=t.originalEvent;this.options.dragOverBubble||t.rootEl||this._handleAutoScroll(t)},drop:function(){this.sortable.nativeDraggable?p(document,"dragover",this._handleAutoScroll):(p(document,"pointermove",this._handleFallbackAutoScroll),p(document,"touchmove",this._handleFallbackAutoScroll),p(document,"mousemove",this._handleFallbackAutoScroll)),ne(),ee(),clearTimeout(v),v=void 0},nulling:function(){$t=qt=Ut=te=Qt=Vt=Zt=null,Jt.length=0},_handleFallbackAutoScroll:function(t){this._handleAutoScroll(t,!0)},_handleAutoScroll:function(e,n){var o,i=this,r=(e.touches?e.touches[0]:e).clientX,a=(e.touches?e.touches[0]:e).clientY,t=document.elementFromPoint(r,a);$t=e,n||this.options.forceAutoScrollFallback||w||y||u?(ie(e,this.options,t,n),o=M(t,!0),!te||Qt&&r===Vt&&a===Zt||(Qt&&ne(),Qt=setInterval(function(){var t=M(document.elementFromPoint(r,a),!0);t!==o&&(o=t,ee()),ie(e,i.options,t,n)},10),Vt=r,Zt=a)):this.options.bubbleScroll&&M(t,!0)!==O()?ie(e,this.options,M(t,!1),!1):ee()}},a(t,{pluginName:"scroll",initializeByDefault:!0})}),Ht.mount(ae,re),Ht.mount(new function(){function t(){this.defaults={swapClass:"sortable-swap-highlight"}}return t.prototype={dragStart:function(t){t=t.dragEl;oe=t},dragOverValid:function(t){var e=t.completed,n=t.target,o=t.onMove,i=t.activeSortable,r=t.changed,a=t.cancel;i.options.swap&&(t=this.sortable.el,i=this.options,n&&n!==t&&(t=oe,oe=!1!==o(n)?(k(n,i.swapClass,!0),n):null,t&&t!==oe&&k(t,i.swapClass,!1)),r(),e(!0),a())},drop:function(t){var e,n,o=t.activeSortable,i=t.putSortable,r=t.dragEl,a=i||this.sortable,l=this.options;oe&&k(oe,l.swapClass,!1),oe&&(l.swap||i&&i.options.swap)&&r!==oe&&(a.captureAnimationState(),a!==o&&o.captureAnimationState(),n=oe,t=(e=r).parentNode,l=n.parentNode,t&&l&&!t.isEqualNode(n)&&!l.isEqualNode(e)&&(i=j(e),r=j(n),t.isEqualNode(l)&&i<r&&r++,t.insertBefore(n,t.children[i]),l.insertBefore(e,l.children[r])),a.animateAll(),a!==o&&o.animateAll())},nulling:function(){oe=null}},a(t,{pluginName:"swap",eventProperties:function(){return{swapItem:oe}}})}),Ht.mount(new function(){function t(o){for(var t in this)"_"===t.charAt(0)&&"function"==typeof this[t]&&(this[t]=this[t].bind(this));o.options.avoidImplicitDeselect||(o.options.supportPointer?f(document,"pointerup",this._deselectMultiDrag):(f(document,"mouseup",this._deselectMultiDrag),f(document,"touchend",this._deselectMultiDrag))),f(document,"keydown",this._checkKeyDown),f(document,"keyup",this._checkKeyUp),this.defaults={selectedClass:"sortable-selected",multiDragKey:null,avoidImplicitDeselect:!1,setData:function(t,e){var n="";he.length&&se===o?he.forEach(function(t,e){n+=(e?", ":"")+t.textContent}):n=e.textContent,t.setData("Text",n)}}}return t.prototype={multiDragKeyDown:!1,isMultiDrag:!1,delayStartGlobal:function(t){t=t.dragEl;ce=t},delayEnded:function(){this.isMultiDrag=~he.indexOf(ce)},setupClone:function(t){var e=t.sortable,t=t.cancel;if(this.isMultiDrag){for(var n=0;n<he.length;n++)fe.push(T(he[n])),fe[n].sortableIndex=he[n].sortableIndex,fe[n].draggable=!1,fe[n].style["will-change"]="",k(fe[n],this.options.selectedClass,!1),he[n]===ce&&k(fe[n],this.options.chosenClass,!1);e._hideClone(),t()}},clone:function(t){var e=t.sortable,n=t.rootEl,o=t.dispatchSortableEvent,t=t.cancel;this.isMultiDrag&&(this.options.removeCloneOnHide||he.length&&se===e&&(ve(!0,n),o("clone"),t()))},showClone:function(t){var e=t.cloneNowShown,n=t.rootEl,t=t.cancel;this.isMultiDrag&&(ve(!1,n),fe.forEach(function(t){R(t,"display","")}),e(),de=!1,t())},hideClone:function(t){var e=this,n=(t.sortable,t.cloneNowHidden),t=t.cancel;this.isMultiDrag&&(fe.forEach(function(t){R(t,"display","none"),e.options.removeCloneOnHide&&t.parentNode&&t.parentNode.removeChild(t)}),n(),de=!0,t())},dragStartGlobal:function(t){t.sortable;!this.isMultiDrag&&se&&se.multiDrag._deselectMultiDrag(),he.forEach(function(t){t.sortableIndex=j(t)}),he=he.sort(function(t,e){return t.sortableIndex-e.sortableIndex}),me=!0},dragStarted:function(t){var e,n=this,t=t.sortable;this.isMultiDrag&&(this.options.sort&&(t.captureAnimationState(),this.options.animation&&(he.forEach(function(t){t!==ce&&R(t,"position","absolute")}),e=X(ce,!1,!0,!0),he.forEach(function(t){t!==ce&&x(t,e)}),pe=ge=!0)),t.animateAll(function(){pe=ge=!1,n.options.animation&&he.forEach(function(t){A(t)}),n.options.sort&&be()}))},dragOver:function(t){var e=t.target,n=t.completed,t=t.cancel;ge&&~he.indexOf(e)&&(n(!1),t())},revert:function(t){var n,o,e=t.fromSortable,i=t.rootEl,r=t.sortable,a=t.dragRect;1<he.length&&(he.forEach(function(t){r.addAnimationState({target:t,rect:ge?X(t):a}),A(t),t.fromRect=a,e.removeAnimationState(t)}),ge=!1,n=!this.options.removeCloneOnHide,o=i,he.forEach(function(t,e){e=o.children[t.sortableIndex+(n?Number(e):0)];e?o.insertBefore(t,e):o.appendChild(t)}))},dragOverCompleted:function(t){var e,n=t.sortable,o=t.isOwner,i=t.insertion,r=t.activeSortable,a=t.parentEl,l=t.putSortable,t=this.options;i&&(o&&r._hideClone(),pe=!1,t.animation&&1<he.length&&(ge||!o&&!r.options.sort&&!l)&&(e=X(ce,!1,!0,!0),he.forEach(function(t){t!==ce&&(x(t,e),a.appendChild(t))}),ge=!0),o||(ge||be(),1<he.length?(o=de,r._showClone(n),r.options.animation&&!de&&o&&fe.forEach(function(t){r.addAnimationState({target:t,rect:ue}),t.fromRect=ue,t.thisAnimationDuration=null})):r._showClone(n)))},dragOverAnimationCapture:function(t){var e=t.dragRect,n=t.isOwner,t=t.activeSortable;he.forEach(function(t){t.thisAnimationDuration=null}),t.options.animation&&!n&&t.multiDrag.isMultiDrag&&(ue=a({},e),e=D(ce,!0),ue.top-=e.f,ue.left-=e.e)},dragOverAnimationComplete:function(){ge&&(ge=!1,be())},drop:function(t){var o,i,r,a,n,e,l,s=t.originalEvent,c=t.rootEl,u=t.parentEl,d=t.sortable,h=t.dispatchSortableEvent,f=t.oldIndex,t=t.putSortable,p=t||this.sortable;s&&(o=this.options,i=u.children,me||(o.multiDragKey&&!this.multiDragKeyDown&&this._deselectMultiDrag(),k(ce,o.selectedClass,!~he.indexOf(ce)),~he.indexOf(ce)?(he.splice(he.indexOf(ce),1),le=null,U({sortable:d,rootEl:c,name:"deselect",targetEl:ce,originalEvent:s})):(he.push(ce),U({sortable:d,rootEl:c,name:"select",targetEl:ce,originalEvent:s}),s.shiftKey&&le&&d.el.contains(le)?(r=j(le),a=j(ce),~r&&~a&&r!==a&&function(){for(var e,t=r<a?(e=r,a):(e=a,r+1),n=o.filter;e<t;e++)~he.indexOf(i[e])||P(i[e],o.draggable,u,!1)&&(n&&("function"==typeof n?n.call(d,s,i[e],d):n.split(",").some(function(t){return P(i[e],t.trim(),u,!1)}))||(k(i[e],o.selectedClass,!0),he.push(i[e]),U({sortable:d,rootEl:c,name:"select",targetEl:i[e],originalEvent:s})))}()):le=ce,se=p)),me&&this.isMultiDrag&&(ge=!1,(u[K].options.sort||u!==c)&&1<he.length&&(n=X(ce),e=j(ce,":not(."+this.options.selectedClass+")"),!pe&&o.animation&&(ce.thisAnimationDuration=null),p.captureAnimationState(),pe||(o.animation&&(ce.fromRect=n,he.forEach(function(t){var e;t.thisAnimationDuration=null,t!==ce&&(e=ge?X(t):n,t.fromRect=e,p.addAnimationState({target:t,rect:e}))})),be(),he.forEach(function(t){i[e]?u.insertBefore(t,i[e]):u.appendChild(t),e++}),f===j(ce)&&(l=!1,he.forEach(function(t){t.sortableIndex!==j(t)&&(l=!0)}),l&&(h("update"),h("sort")))),he.forEach(function(t){A(t)}),p.animateAll()),se=p),(c===u||t&&"clone"!==t.lastPutMode)&&fe.forEach(function(t){t.parentNode&&t.parentNode.removeChild(t)}))},nullingGlobal:function(){this.isMultiDrag=me=!1,fe.length=0},destroyGlobal:function(){this._deselectMultiDrag(),p(document,"pointerup",this._deselectMultiDrag),p(document,"mouseup",this._deselectMultiDrag),p(document,"touchend",this._deselectMultiDrag),p(document,"keydown",this._checkKeyDown),p(document,"keyup",this._checkKeyUp)},_deselectMultiDrag:function(t){if(!(void 0!==me&&me||se!==this.sortable||t&&P(t.target,this.options.draggable,this.sortable.el,!1)||t&&0!==t.button))for(;he.length;){var e=he[0];k(e,this.options.selectedClass,!1),he.shift(),U({sortable:this.sortable,rootEl:this.sortable.el,name:"deselect",targetEl:e,originalEvent:t})}},_checkKeyDown:function(t){t.key===this.options.multiDragKey&&(this.multiDragKeyDown=!0)},_checkKeyUp:function(t){t.key===this.options.multiDragKey&&(this.multiDragKeyDown=!1)}},a(t,{pluginName:"multiDrag",utils:{select:function(t){var e=t.parentNode[K];e&&e.options.multiDrag&&!~he.indexOf(t)&&(se&&se!==e&&(se.multiDrag._deselectMultiDrag(),se=e),k(t,e.options.selectedClass,!0),he.push(t))},deselect:function(t){var e=t.parentNode[K],n=he.indexOf(t);e&&e.options.multiDrag&&~n&&(k(t,e.options.selectedClass,!1),he.splice(n,1))}},eventProperties:function(){var n=this,o=[],i=[];return he.forEach(function(t){var e;o.push({multiDragElement:t,index:t.sortableIndex}),e=ge&&t!==ce?-1:ge?j(t,":not(."+n.options.selectedClass+")"):j(t),i.push({multiDragElement:t,index:e})}),{items:e(he),clones:[].concat(fe),oldIndicies:o,newIndicies:i}},optionListeners:{multiDragKey:function(t){return"ctrl"===(t=t.toLowerCase())?t="Control":1<t.length&&(t=t.charAt(0).toUpperCase()+t.substr(1)),t}}})}),Ht});
      })(mod, mod.exports)
      SortableLib = mod.exports
      return SortableLib
    }
    var PANEL_ID = 'memo'
    var API = '/memo/api/'

    /* ---------------- 与 host 半侧通信 ---------------- */

    async function call(method, payload) {
      var res = await fetch(API + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      })
      var data = await res.json().catch(() => ({ ok: false, error: 'invalid response' }))
      if (!data.ok) throw new Error(data.error || t('err.request'))
      return data.value
    }

    /* ---------------- 样式（跟随 DSH 主题 token） ---------------- */

    var CSS = [
      // 面板根容器：DSH 的 main 面板是 flex/grid 容器，子元素必须自己声明撑满，
      // 否则只会按内容宽度排（真机上表现为所有内容挤在左上角）
      '.dm-wrap{display:flex;flex-direction:column;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dm-head{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}',
      '.dm-head h2{font-size:14.5px;font-weight:650;margin:0;letter-spacing:-.2px}',
      '.dm-count{color:var(--dsw-alias-label-secondary);font-size:12px;opacity:.85}',
      '.dm-spacer{flex:1}',
      '.dm-chip{padding:4px 10px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:11.5px;cursor:pointer;white-space:nowrap}',
      '.dm-chip:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dm-chip.on{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dm-sync{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dm-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}',
      '.dm-dot.off{background:var(--dsw-alias-state-idle-primary)}',
      '.dm-dot.err{background:var(--dsw-alias-state-error-primary)}',
      '.dm-compose{margin:14px 18px 0;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;flex:none}',
      '.dm-compose:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)}',
      '.dm-ta{width:100%;box-sizing:border-box;padding:11px 13px 8px;border:none;outline:none;background:transparent;color:inherit;font:inherit;line-height:1.6;resize:vertical;min-height:80px;max-height:340px;display:block}',
      '.dm-ta::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}',
      '.dm-thumbs{display:flex;gap:7px;padding:0 13px 6px;flex-wrap:wrap}',
      '.dm-thumb{position:relative;width:56px;height:56px;border-radius:7px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2)}',
      '.dm-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
      '.dm-thumb button{position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:5px;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:11px;line-height:1;cursor:pointer}',
      '.dm-row{display:flex;align-items:center;gap:6px;padding:6px 9px 8px;border-top:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}',
      '.dm-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:7px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}',
      '.dm-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dm-btn.pri{background:var(--dsw-alias-brand-primary);color:#fff;font-weight:560;padding:5px 14px}',
      '.dm-btn.pri:disabled{opacity:.5;cursor:default}',
      '.dm-hint{color:var(--dsw-alias-label-secondary);font-size:11px;opacity:.7;margin-left:2px}',
      '.dm-syncbtn{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}',
      '.dm-syncbtn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dm-syncbtn:disabled{opacity:.55;cursor:default}',
      '@keyframes dm-spin{to{transform:rotate(360deg)}}',
      '.dm-spin{animation:dm-spin .9s linear infinite}',
      '.dm-toast{position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:950;display:flex;align-items:center;gap:9px;padding:10px 15px;border-radius:10px;font-size:12.5px;font-weight:520;background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 34px rgba(0,0,0,.38);border:1px solid;max-width:min(440px,86vw);animation:dm-toast-in .2s ease-out}',
      '.dm-toast.ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.dm-toast.err{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '@keyframes dm-toast-in{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}',
      '.dm-card.editing{background:transparent;border-color:transparent;padding:4px 0}',
      '.dm-edit{flex:1;min-width:0;border:1px solid var(--dsw-alias-brand-primary);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)}',
      '.dm-edit-ta{width:100%;box-sizing:border-box;padding:10px 12px 6px;border:none;outline:none;background:transparent;color:inherit;font:inherit;line-height:1.6;resize:vertical;min-height:74px;max-height:300px;display:block}',
      '.dm-edit-row{display:flex;align-items:center;gap:6px;padding:6px 9px 8px;border-top:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}',
      '.dm-tagbox{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 18px 6px;flex:none}',
      '.dm-tagnew{padding:1px 8px;border-radius:5px;font-size:10.5px;background:transparent;border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);opacity:.9;white-space:nowrap}',
      '.dm-filters{display:flex;gap:6px;padding:11px 18px 4px;flex-wrap:wrap;flex:none}',
      '.dm-list{flex:1;overflow-y:auto;padding:6px 18px 24px;min-height:0}',
      '.dm-day{display:flex;align-items:center;gap:9px;padding:13px 2px 7px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;opacity:.75}',
      '.dm-day:after{content:"";flex:1;height:1px;background:var(--dsw-alias-border-l1)}',
      '.dm-card{display:flex;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid transparent;margin-bottom:3px;position:relative}',
      '.dm-card:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1)}',
      '.dm-cb{width:16px;height:16px;border-radius:50%;border:1.6px solid var(--dsw-alias-border-l2);flex:none;margin-top:2px;cursor:pointer;display:grid;place-items:center;color:transparent;background:transparent;padding:0}',
      '.dm-cb:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.dm-card.done .dm-cb{background:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);color:#fff}',
      '.dm-card.done .dm-body{opacity:.45}',
      '.dm-card.done .dm-txt{text-decoration:line-through}',
      '.dm-card.pinned{background:var(--dsw-alias-bg-layer-1)}',
      '.dm-card.pinned:before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}',
      '.dm-pinrow{display:flex;align-items:center;gap:4px;margin-bottom:3px;font-size:10.5px;font-weight:600;color:var(--dsw-alias-brand-primary);opacity:.92}',
      '.dm-cards .dm-card{cursor:grab}',
      '.dm-cards .dm-card:active{cursor:grabbing}',
      // 原位占位：始终显示的空心虚线框。用 .dm-card 前缀压过 .dm-drag-chosen，免得被染成品牌色
      '.dm-card.dm-drag-ghost{border:1px dashed color-mix(in srgb, var(--dsw-alias-border-l2) 55%, transparent);background:transparent;box-shadow:none}',
      '.dm-drag-ghost>*{visibility:hidden}',
      // 跟随指针的克隆（fallback 模式）；写在 ghost 之后，即使它同时被加了 ghost 类也按「浮起」显示
      '.dm-card.dm-drag-fallback{box-shadow:0 14px 34px rgba(0,0,0,.4);border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);opacity:.97}',
      '.dm-card.dm-drag-fallback>*{visibility:visible}',
      '.dm-drag-chosen{cursor:grabbing}',
      '.dm-body{flex:1;min-width:0}',
      '.dm-txt{font-size:13px;line-height:1.62;white-space:pre-wrap;word-break:break-word}',
      '.dm-meta{display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary);opacity:.85}',
      '.dm-tag{padding:1px 7px;border-radius:5px;font-size:11px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);cursor:pointer}',
      '.dm-tag:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dm-imgs{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}',
      '.dm-imgs img{width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);cursor:zoom-in;display:block}',
      '.dm-act{position:absolute;right:10px;top:9px;display:none;gap:3px}',
      '.dm-card:hover .dm-act{display:flex}',
      '.dm-ib{width:25px;height:25px;border-radius:6px;display:grid;place-items:center;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}',
      '.dm-ib:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.dm-ib.on{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)}',
      '.dm-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:60px 20px;color:var(--dsw-alias-label-secondary);text-align:center;opacity:.8}',
      '.dm-err{margin:12px 18px 0;padding:9px 12px;border-radius:9px;font-size:12px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}',
      '.dm-view{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.72);display:grid;place-items:center;cursor:zoom-out}',
      '.dm-view img{max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.6)}',
      '.dm-modal{position:fixed;inset:0;z-index:901;background:rgba(0,0,0,.55);display:grid;place-items:center}',
      '.dm-dlg{width:520px;max-width:92vw;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:18px 20px;box-shadow:0 24px 60px rgba(0,0,0,.5)}',
      '.dm-dlg h3{margin:0 0 4px;font-size:14px;font-weight:650}',
      '.dm-dlg .sub{color:var(--dsw-alias-label-secondary);font-size:11.5px;margin-bottom:14px;line-height:1.6}',
      '.dm-field{margin-bottom:12px}',
      '.dm-field label{display:block;font-size:10.5px;font-weight:650;letter-spacing:.4px;text-transform:uppercase;color:var(--dsw-alias-label-secondary);margin-bottom:5px}',
      '.dm-field input{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;font:inherit;font-size:12.5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;outline:none}',
      '.dm-field input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dm-field .help{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px;line-height:1.5;opacity:.85}',
      '.dm-dlgfoot{display:flex;align-items:center;gap:8px;margin-top:16px}',
    ].join('\n')

    /* ---------------- 国际化（跟随 DSH 的 locale） ---------------- */

    var NS = 'dsh-memo'

    var DICT = {
      zh: {
        'panel': '备忘录',
        'count': '{total} 条 · {todo} 条待处理',
        'sync.synced': '已同步',
        'sync.pending': '待同步',
        'sync.local': '仅本地',
        'sync.error': '同步异常',
        'sync.now': '立即同步',
        'sync.doing': '同步中…',
        'sync.tip': '立即同步到 GitHub',
        'sync.tipLocal': '未配置远程仓库，将只做本地提交',
        'sync.tipRepo': '仓库 {repo}',
        'sync.tipPushed': '仓库 {repo} · 上次推送 {time}',
        'sync.noRepo': '未配置 GitHub 仓库',
        'sync.ok': '已同步到 GitHub',
        'sync.commitOnly': '已提交到本地（未配置远程仓库）',
        'sync.nochange': '没有需要同步的改动',
        'sync.fail': '同步失败：{msg}',
        'sync.autoFail': '自动同步失败：{msg}',
        'sync.autoOk': '已自动同步到 GitHub',
        'search.ph': '搜索…',
        'compose.ph': '记点什么…  例：张总要登录页加微信扫码，下周三前给原型 #需求变更',
        'compose.hint': 'Enter 保存 · ⇧Enter 换行 · 图片可多选 · 打 #标签 自动创建',
        'btn.image': '图片',
        'btn.imageTip': '选择图片（可多选；也可直接拖进来或 ⌘V 粘贴）',
        'btn.save': '保存',
        'btn.saving': '保存中…',
        'filter.all': '全部',
        'filter.todo': '待处理',
        'filter.done': '已完成',
        'filter.today': '今天',
        'filter.pinned': '置顶',
        'tag.lead': '标签',
        'tag.new': '打 #名字 新建',
        'tag.newTip': '标签不是固定的：在正文里打 #任意名字 保存，就会自动创建（标签与前后文字用空格或标点隔开更准确）',
        'tag.none': '还没有标签',
        'tag.usedBy': '{n} 条备忘在用',
        'empty.loading': '加载中…',
        'empty.none': '还没有备忘，上面输入框写一条试试',
        'empty.filtered': '没有匹配的备忘',
        'day.yesterday': '昨天',
        'day.earlier': '更早',
        'time.yesterday': '昨天 {time}',
        'card.source': '来源：{source}',
        'card.due': '截止 {date}',
        'card.markDone': '标记完成',
        'card.markUndone': '标记未完成',
        'card.edit': '编辑',
        'card.pin': '置顶',
        'card.pinned': '已置顶',
        'card.unpin': '取消置顶',
        'card.del': '删除',
        'edit.cancel': '取消',
        'edit.hint': '标签已并回正文（#标签），删掉即取消',
        'edit.newImages': '新增 {n} 张',
        'img.name': '截图.png',
        'cfg.title': 'GitHub 同步设置',
        'cfg.desc': '同步的是文本层（notes/ 每条一个 .md、attachments/ 图片、log/ 事件日志）；SQLite 只作本地索引，不进仓库。令牌保存在数据目录的 .token（权限 0600），已被 .gitignore 忽略，永远不会提交。',
        'cfg.repo': '仓库',
        'cfg.repoPh': '用户名/仓库名',
        'cfg.repoHelp': '私有仓库即可，例：yourname/dsh-memo-data；留空 = 只在本地保存',
        'cfg.token': '访问令牌（Fine-grained PAT）',
        'cfg.tokenHelp': '权限只需 Contents: Read and write。留空表示不改动已保存的令牌。',
        'cfg.save': '保存并同步',
        'cfg.close': '关闭',
        'cfg.savedLocal': '已保存（未配置仓库，仅本地保存）',
        'cfg.savedPushed': '已保存，并已推送一次',
        'cfg.pushFail': '保存了，但推送失败：{msg}',
        'cfg.fail': '失败：{msg}',
        'err.request': '请求失败',
      },
      en: {
        'panel': 'Memo',
        'count': '{total} notes · {todo} open',
        'sync.synced': 'Synced',
        'sync.pending': 'Pending',
        'sync.local': 'Local only',
        'sync.error': 'Sync error',
        'sync.now': 'Sync now',
        'sync.doing': 'Syncing…',
        'sync.tip': 'Sync to GitHub now',
        'sync.tipLocal': 'No remote configured — commits locally only',
        'sync.tipRepo': 'Repository {repo}',
        'sync.tipPushed': 'Repository {repo} · last push {time}',
        'sync.noRepo': 'No GitHub repository configured',
        'sync.ok': 'Synced to GitHub',
        'sync.commitOnly': 'Committed locally (no remote configured)',
        'sync.nochange': 'Nothing to sync',
        'sync.fail': 'Sync failed: {msg}',
        'sync.autoFail': 'Auto-sync failed: {msg}',
        'sync.autoOk': 'Auto-synced to GitHub',
        'search.ph': 'Search…',
        'compose.ph': 'Note something…  e.g. WeChat QR login on the login page, prototype due Wednesday #requirement',
        'compose.hint': 'Enter to save · ⇧Enter for newline · images multi-select · type #tag to create',
        'btn.image': 'Image',
        'btn.imageTip': 'Pick images (multi-select; or drag them in, or paste with ⌘V)',
        'btn.save': 'Save',
        'btn.saving': 'Saving…',
        'filter.all': 'All',
        'filter.todo': 'Open',
        'filter.done': 'Done',
        'filter.today': 'Today',
        'filter.pinned': 'Pinned',
        'tag.lead': 'Tags',
        'tag.new': 'type #name to create',
        'tag.newTip': 'Tags are not fixed: type #anything in the body and save — it is created automatically (separate it from the text with a space or punctuation for accuracy)',
        'tag.none': 'No tags yet',
        'tag.usedBy': 'used by {n} note(s)',
        'empty.loading': 'Loading…',
        'empty.none': 'No notes yet — write one in the box above',
        'empty.filtered': 'No matching notes',
        'day.yesterday': 'Yesterday',
        'day.earlier': 'Earlier',
        'time.yesterday': 'Yesterday {time}',
        'card.source': 'Source: {source}',
        'card.due': 'Due {date}',
        'card.markDone': 'Mark as done',
        'card.markUndone': 'Mark as open',
        'card.edit': 'Edit',
        'card.pin': 'Pin',
        'card.pinned': 'Pinned',
        'card.unpin': 'Unpin',
        'card.del': 'Delete',
        'edit.cancel': 'Cancel',
        'edit.hint': 'Tags are merged into the body as #tags — delete one to drop it',
        'edit.newImages': '{n} new image(s)',
        'img.name': 'screenshot.png',
        'cfg.title': 'GitHub sync',
        'cfg.desc': 'What syncs is the text layer (one .md per note under notes/, images under attachments/, the event log under log/); SQLite is only a local index and never enters the repository. The token lives in .token inside the data directory (mode 0600), is git-ignored, and is never committed.',
        'cfg.repo': 'Repository',
        'cfg.repoPh': 'owner/repo',
        'cfg.repoHelp': 'A private repo is fine, e.g. yourname/dsh-memo-data; leave empty to keep everything local',
        'cfg.token': 'Access token (fine-grained PAT)',
        'cfg.tokenHelp': 'Only Contents: Read and write is needed. Leave empty to keep the stored token unchanged.',
        'cfg.save': 'Save and sync',
        'cfg.close': 'Close',
        'cfg.savedLocal': 'Saved (no repository configured — local only)',
        'cfg.savedPushed': 'Saved and pushed once',
        'cfg.pushFail': 'Saved, but the push failed: {msg}',
        'cfg.fail': 'Failed: {msg}',
        'err.request': 'request failed',
      },
    }

    /** 取当前语言的文案；第二参做 {name} 插值。 */
    function makeT(bind) {
      return function (key, vars) {
        var s = bind(key)
        if (!vars) return s
        return String(s).replace(/\{(\w+)\}/g, function (_, k) {
          return vars[k] === undefined ? '' : vars[k]
        })
      }
    }

    /* ---------------- 图标 ---------------- */

    function Svg(props) {
      var size = props.size || 15
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        className: props.className,
        style: props.style || { flex: 'none' },
      }, props.children)
    }

    function MemoIcon(props) {
      var size = (props && props.size) || 16
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, [
        h('path', { key: 'a', d: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9l-5 5H6a2 2 0 0 1-2-2z' }),
        h('path', { key: 'b', d: 'M15 19v-4a1 1 0 0 1 1-1h4' }),
        h('path', { key: 'c', d: 'M8 8h8M8 12h5' }),
      ])
    }

    /**
     * 拖拽结果落到列表上：把 list 里属于该组的条目按 ids 的新顺序就地重排，
     * 其他条目（别的日期分组 / 当前过滤器下不可见的条目）位置保持不动。
     */
    function applyGroupOrder(list, ids) {
      var order = {}
      ids.forEach(function (id, i) { order[id] = i })
      var picked = list.filter(function (it) { return order[it.id] !== undefined })
      picked.sort(function (a, b) { return order[a.id] - order[b.id] })
      var queue = picked.slice()
      return list.map(function (it) { return order[it.id] !== undefined ? queue.shift() : it })
    }

    /**
     * 从正文里抽 #标签 —— 规则必须与 host 侧 lib/index.js 的 extractTags 完全一致：
     * 前缀可以是行首 / 空白 / 标点 / 汉字紧贴（`买牛奶#购物` 也算），名字在空白、# 或中英文标点处结束。
     */
    function extractTagsFrom(text) {
      var out = []
      var cut = /[，。！？、；：""''（）()【】\[\]{}《》〈〉「」『』,.!?;:'"·|/\\]/
      var re = /(^|[^A-Za-z0-9_#])#([^\s#]{1,24})/g
      var m
      while ((m = re.exec(String(text == null ? '' : text))) !== null) {
        var t = String(m[2]).split(cut)[0].trim()
        if (t && out.indexOf(t) < 0) out.push(t)
      }
      return out
    }

    /**
     * 编辑态：把已存的标签以 #标签 的形式并回正文。
     * 存储层为了单独建标签索引，会把 #标签 从正文里剥掉；编辑时若直接显示剥离后的正文，
     * 用户既看不到标签，一保存（tags 完全跟随正文）还会把标签清空。
     */
    function withTagsInBody(body, tags) {
      var text = String(body == null ? '' : body)
      var have = extractTagsFrom(text)
      var extra = (tags || []).filter(function (t) { return t && have.indexOf(t) < 0 })
      if (extra.length === 0) return text
      var suffix = extra.map(function (t) { return '#' + t }).join(' ')
      return text.length > 0 ? text + '\n' + suffix : suffix
    }

    /* ---------------- 小组件 ---------------- */

    function Check() {
      return h('svg', { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M20 6L9 17l-5-5' }))
    }

    function fmtTime(iso, t) {
      if (!iso) return ''
      var d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      var now = new Date()
      var pad = function (n) { return String(n).padStart(2, '0') }
      var hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
      var sameDay = d.toDateString() === now.toDateString()
      if (sameDay) return hm
      var yesterday = new Date(now.getTime() - 86400000)
      if (d.toDateString() === yesterday.toDateString()) return t('time.yesterday', { time: hm })
      return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm
    }

    function dayKey(iso) {
      if (!iso) return ''
      var d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }

    function dayLabel(iso, t) {
      var k = dayKey(iso)
      if (!k) return t('day.earlier')
      var now = new Date()
      var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
      var y = new Date(now.getTime() - 86400000)
      var yest = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0')
      if (k === today) return t('filter.today')
      if (k === yest) return t('day.yesterday')
      return k
    }

    /* ---------------- 主面板 ---------------- */

    function MemoPanel(props) {
      // 注册时声明了 locale: NS，框架会把绑定好的 t 作为 standard seat 注入 props
      var t = (props && props.t) || makeT(function (k) { return DICT.zh[k] !== undefined ? DICT.zh[k] : k })
      var [loading, setLoading] = useState(true)
      var [items, setItems] = useState([])
      var [tags, setTags] = useState([])
      var [stats, setStats] = useState({ total: 0, todo: 0, done: 0 })
      var [sync, setSync] = useState({})
      var [error, setError] = useState('')
      var [draft, setDraft] = useState('')
      var [pending, setPending] = useState([])
      var [tag, setTag] = useState('')
      var [filter, setFilter] = useState('all')
      var [q, setQ] = useState('')
      var [busy, setBusy] = useState(false)
      var [zoom, setZoom] = useState('')
      var [showCfg, setShowCfg] = useState(false)
      var [cfgRepo, setCfgRepo] = useState('')
      var [cfgToken, setCfgToken] = useState('')
      var [cfgMsg, setCfgMsg] = useState('')
      var [cfgBusy, setCfgBusy] = useState(false)
      var [editId, setEditId] = useState('')
      var [editBody, setEditBody] = useState('')
      var [editKeep, setEditKeep] = useState([])
      var [editNew, setEditNew] = useState([])
      var [editBusy, setEditBusy] = useState(false)
      var editFileRef = useRef(null)
      // 每个日期分组的卡片容器（dayKey → DOM），拖拽实例挂在上面
      var sortRefs = useRef({})
      var [syncing, setSyncing] = useState(false)
      var [toast, setToast] = useState(null)
      var toastTimer = useRef(null)
      var syncCheckRef = useRef(null)
      var lastErrRef = useRef('')
      var taRef = useRef(null)
      var fileRef = useRef(null)

      var refresh = useCallback(function (opts) {
        var o = opts || {}
        return call('list', {
          q: o.q !== undefined ? o.q : q,
          tag: o.tag !== undefined ? o.tag : tag,
          filter: o.filter !== undefined ? o.filter : filter,
          limit: 300,
        }).then(function (v) {
          setItems(v.items || [])
          setLoading(false)
        }).catch(function (e) {
          setError(String(e.message || e))
          setLoading(false)
        })
      }, [q, tag, filter])

      useEffect(function () {
        call('bootstrap').then(function (v) {
          setItems(v.items || [])
          setTags(v.tags || [])
          setStats(v.stats || {})
          setSync(v.sync || {})
          setCfgRepo((v.config && v.config.repo) || '')
          setLoading(false)
        }).catch(function (e) {
          setError(String(e.message || e))
          setLoading(false)
        })
      }, [])

      useEffect(function () { if (!loading) refresh() }, [filter, tag])

      // 卸载时清掉挂起的提示/检查定时器，避免面板切走后还在 setState
      useEffect(function () {
        return function () {
          if (toastTimer.current) clearTimeout(toastTimer.current)
          if (syncCheckRef.current) clearTimeout(syncCheckRef.current)
        }
      }, [])


      /** 拖拽结束：先按新顺序乐观更新本地列表（React 重渲染不跳），再把顺序提交给宿主。 */
      function commitGroupOrder(dayK, evt) {
        var container = evt && evt.to
        if (!container) return
        var ids = Array.prototype.slice.call(container.querySelectorAll('.dm-card'))
          .map(function (c) { return c.getAttribute('data-id') })
          .filter(Boolean)
        if (ids.length === 0) return
        setItems(function (list) { return applyGroupOrder(list, ids) })
        setError('')
        call('reorder', { ids: ids })
          .then(function () { return refresh() })
          .then(function () { scheduleSyncCheck() })
          .catch(function (e) { setError(String(e.message || e)); return refresh() })
      }

      function addFiles(files) {
        Array.prototype.slice.call(files || []).forEach(function (f) {
          if (!f || !/^image\//.test(f.type)) return
          var reader = new FileReader()
          reader.onload = function () {
            setPending(function (p) { return p.concat([{ dataUrl: String(reader.result), name: f.name || t('img.name') }]) })
          }
          reader.readAsDataURL(f)
        })
      }

      function onPaste(e) {
        var items = (e.clipboardData && e.clipboardData.items) || []
        var files = []
        for (var i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf('image/') === 0) {
            var f = items[i].getAsFile()
            if (f) files.push(f)
          }
        }
        if (files.length > 0) { e.preventDefault(); addFiles(files) }
      }

      function save() {
        var text = draft.trim()
        if (!text && pending.length === 0) return
        setBusy(true)
        setError('')
        call('create', { body: text, attachments: pending })
          .then(function (v) {
            setDraft('')
            setPending([])
            setStats(v.stats || {})
            setLoading(false)
            return refresh()
          })
          .then(function () { return call('tags').then(function (v) { setTags(v.tags || []) }) })
          .then(function () { scheduleSyncCheck() })
          .catch(function (e) { setError(String(e.message || e)) })
          .finally(function () { setBusy(false) })
      }

      function toggleDone(item) {
        call('update', { id: item.id, patch: { done: !item.done } })
          .then(function (v) { setStats(v.stats || {}); return refresh() })
          .then(function () { scheduleSyncCheck() })
          .catch(function (e) { setError(String(e.message || e)) })
      }

      function removeItem(item) {
        call('remove', { id: item.id })
          .then(function (v) { setStats(v.stats || {}); return refresh() })
          .then(function () { scheduleSyncCheck() })
          .catch(function (e) { setError(String(e.message || e)) })
      }

      function startEdit(item) {
        setEditId(item.id)
        // 标签在存储层已从正文剥离：编辑时必须并回正文，否则看不到、一保存就丢
        setEditBody(withTagsInBody(item.body || '', item.tags || []))
        setEditKeep((item.attachments || []).slice())
        setEditNew([])
        setError('')
      }

      function cancelEdit() {
        setEditId(''); setEditBody(''); setEditKeep([]); setEditNew([])
      }

      function addEditFiles(files) {
        Array.prototype.slice.call(files || []).forEach(function (f) {
          if (!f || !/^image\//.test(f.type)) return
          var reader = new FileReader()
          reader.onload = function () {
            setEditNew(function (p) { return p.concat([{ dataUrl: String(reader.result), name: f.name || t('img.name') }]) })
          }
          reader.readAsDataURL(f)
        })
      }

      function saveEdit(item) {
        setEditBusy(true)
        setError('')
        // 保住的是"还留着的旧图"，其余按 id 解除引用
        var removed = (item.attachments || []).filter(function (a) {
          return !editKeep.some(function (k) { return k.id === a.id })
        }).map(function (a) { return a.id })
        call('update', {
          id: item.id,
          patch: {
            body: editBody,
            tags: extractTagsFrom(editBody),   // 显式给出 → 标签完全跟随正文
            attachments: editNew,
            removeAttachments: removed,
          },
        })
          .then(function (v) { setStats(v.stats || {}); cancelEdit(); return refresh() })
          .then(function () { return call('tags').then(function (v) { setTags(v.tags || []) }) })
          .then(function () { scheduleSyncCheck() })
          .catch(function (e) { setError(String(e.message || e)) })
          .finally(function () { setEditBusy(false) })
      }

      function toggleTag(name) { setTag(function (t) { return t === name ? '' : name }) }

      /** 同步结果提示：成功用成功色，失败用失败色。 */
      function notify(kind, text) {
        setToast({ kind: kind, text: text })
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(function () { setToast(null) }, kind === 'err' ? 7000 : 3200)
      }

      /** 手动同步：无论成功失败都给明确反馈。 */
      function doSync() {
        if (syncing) return
        setSyncing(true)
        call('sync', { action: 'now' })
          .then(function (v) {
            var s = v.sync || {}
            setSync(s)
            var r = v.result || {}
            if (s.lastError) notify('err', t('sync.fail', { msg: s.lastError }))
            else if (r.pushed) notify('ok', t('sync.ok'))
            else if (r.committed) notify('ok', t('sync.commitOnly'))
            else notify('ok', t('sync.nochange'))
            return refresh()
          })
          .catch(function (e) { notify('err', t('sync.fail', { msg: String(e.message || e) })) })
          .finally(function () { setSyncing(false) })
      }

      /** 写操作后顺带看一次同步健康度，好让自动推送的失败也能被看见。 */
      function checkSyncHealth() {
        return call('sync', { action: 'status' }).then(function (v) {
          var s = v.sync || {}
          setSync(s)
          if (s.lastError) {
            if (s.lastError !== lastErrRef.current) {
              lastErrRef.current = s.lastError
              notify('err', t('sync.autoFail', { msg: s.lastError }))
            }
          } else {
            lastErrRef.current = ''
          }
        }).catch(function () { /* 状态查询失败不打扰 */ })
      }

      /** 写操作后 33 秒（防抖窗口之后）再看一眼，捕获自动推送的成功/失败。 */
      function scheduleSyncCheck() {
        if (syncCheckRef.current) clearTimeout(syncCheckRef.current)
        syncCheckRef.current = setTimeout(function () {
          call('sync', { action: 'status' }).then(function (v) {
            var s = v.sync || {}
            setSync(s)
            if (s.lastError) {
              if (s.lastError !== lastErrRef.current) {
                lastErrRef.current = s.lastError
                notify('err', t('sync.autoFail', { msg: s.lastError }))
              }
            } else if (s.lastPushAt && s.lastPushAt !== lastErrRef.current) {
              // 自动推送成功：只在面板开着时给一次轻提示，不重复
              lastErrRef.current = s.lastPushAt
              notify('ok', t('sync.autoOk'))
            }
          }).catch(function () { /* 忽略 */ })
        }, 33000)
      }

      function saveCfg() {
        setCfgBusy(true)
        setCfgMsg('')
        var payload = { action: 'config', repo: cfgRepo }
        if (cfgToken) payload.token = cfgToken
        call('sync', payload)
          .then(function (v) {
            setSync(v.sync || {})
            setCfgToken('')
            if (!cfgRepo) { setCfgMsg(t('cfg.savedLocal')); return null }
            return call('sync', { action: 'now' })
          })
          .then(function (v) {
            if (!v) return
            var s = v.sync || {}
            setSync(s)
            if (s.lastError) { setCfgMsg(t('cfg.pushFail', { msg: s.lastError })); notify('err', t('sync.fail', { msg: s.lastError })) }
            else { setCfgMsg(t('cfg.savedPushed')); notify('ok', t('sync.ok')) }
          })
          .catch(function (e) {
            setCfgMsg(t('cfg.fail', { msg: String(e.message || e) }))
            notify('err', t('sync.fail', { msg: String(e.message || e) }))
          })
          .finally(function () { setCfgBusy(false) })
      }

      function onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
      }

      var grouped = useMemo(function () {
        var out = []
        var map = {}
        items.forEach(function (it) {
          var k = dayKey(it.createdAt)
          if (!map[k]) { map[k] = { key: k, label: dayLabel(it.createdAt, t), items: [] }; out.push(map[k]) }
          map[k].items.push(it)
        })
        return out
      }, [items])

      /**
       * 拖拽排序：每个日期分组一个独立的 Sortable 实例（group 名互不相同 → 天然禁止跨组），
       * 只调整同一天内的先后顺序；跨天的高低继续由「置顶」表达。
       */
      useEffect(function () {
        var Sortable = null
        try { Sortable = getSortable() } catch (e) { return undefined }
        if (!Sortable || !Sortable.create) return undefined
        var instances = []
        Object.keys(sortRefs.current).forEach(function (dayK) {
          var el = sortRefs.current[dayK]
          if (!el) return
          instances.push(Sortable.create(el, {
            animation: 190,                                  // 位移过渡
            easing: 'cubic-bezier(.2,.7,.3,1)',
            draggable: '.dm-card',
            filter: '.dm-cb, .dm-act, .dm-card.editing',      // 点按钮、编辑态的卡片不触发拖拽
            preventOnFilter: true,
            // 用 fallback 而不是浏览器原生 HTML5 拖拽：原生模式下「被拖的元素」就是这张卡片
            // 本身，它跟着指针跑，原位没有独立占位 —— 虚线的目标指示会时有时无，还会和浏览器
            // 自绘的 drag image 打架。fallback 模式下 Sortable 会克隆一份跟随指针，原元素留在
            // 原位当占位，虚线指示因此始终可见。
            forceFallback: true,
            fallbackOnBody: true,                             // 克隆挂到 body，免得被列表的 overflow 裁掉
            fallbackClass: 'dm-drag-fallback',                // 跟随指针的克隆
            ghostClass: 'dm-drag-ghost',                      // 留在原位的占位（虚线框）
            chosenClass: 'dm-drag-chosen',
            group: { name: 'dm-day-' + dayK, pull: false, put: false },
            onEnd: function (evt) { commitGroupOrder(dayK, evt) },
          }))
        })
        return function () {
          instances.forEach(function (s) { try { s.destroy() } catch (e) { /* 忽略 */ } })
        }
      }, [grouped, editId])

      var filterChips = [
        { k: 'all', label: t('filter.all'), n: stats.total },
        { k: 'todo', label: t('filter.todo'), n: stats.todo },
        { k: 'done', label: t('filter.done'), n: stats.done },
        { k: 'today', label: t('filter.today') },
        { k: 'pinned', label: t('filter.pinned') },
      ]

      var syncOk = sync && sync.hasToken !== undefined ? (sync.lastError ? 'err' : (sync.repo ? '' : 'off')) : 'off'
      var syncText = sync.lastError ? t('sync.error') : (sync.repo ? (sync.lastPushAt ? t('sync.synced') : t('sync.pending')) : t('sync.local'))

      return h('div', { className: 'dm-wrap' }, [
        h('div', { className: 'dm-head', key: 'head' }, [
          h('h2', { key: 't' }, t('panel')),
          h('span', { className: 'dm-count', key: 'c' }, t('count', { total: stats.total, todo: stats.todo })),
          h('span', { className: 'dm-spacer', key: 's' }),
          h('span', {
            className: 'dm-sync', key: 'sync',
            title: sync.lastError || (sync.repo ? (sync.lastPushAt ? t('sync.tipPushed', { repo: sync.repo, time: sync.lastPushAt }) : t('sync.tipRepo', { repo: sync.repo })) : t('sync.noRepo')),
            onClick: doSync,
          }, [h('span', { className: 'dm-dot ' + syncOk, key: 'd' }), syncText]),
          h('button', {
            key: 'dosync', className: 'dm-syncbtn', disabled: syncing, onClick: doSync,
            title: sync.repo ? t('sync.tip') : t('sync.tipLocal'),
          }, [
            h(Svg, { key: 'i', size: 13, className: syncing ? 'dm-spin' : '' }, [
              h('path', { key: 1, d: 'M21 12a9 9 0 1 1-2.6-6.4' }),
              h('path', { key: 2, d: 'M21 3v6h-6' }),
            ]),
            syncing ? t('sync.doing') : t('sync.now'),
          ]),
          h('input', {
            key: 'q', value: q, placeholder: t('search.ph'),
            onChange: function (e) { setQ(e.target.value) },
            onKeyDown: function (e) { if (e.key === 'Enter') refresh({ q: e.target.value }) },
            style: {
              width: 150, padding: '5px 9px', borderRadius: 8, font: 'inherit', fontSize: 12,
              border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)',
              color: 'inherit', outline: 'none',
            },
          }),
          h('button', {
            key: 'cfg', className: 'dm-ib', title: t('cfg.title'),
            onClick: function () { setShowCfg(true); setCfgMsg('') },
          }, h(Svg, { size: 14 }, [
            h('path', { key: 1, d: 'M3 6h18M3 12h18M3 18h18' }),
            h('circle', { key: 2, cx: 9, cy: 6, r: 2.2 }),
            h('circle', { key: 3, cx: 15, cy: 12, r: 2.2 }),
            h('circle', { key: 4, cx: 8, cy: 18, r: 2.2 }),
          ])),
        ]),

        error ? h('div', { className: 'dm-err', key: 'err' }, error) : null,

        h('div', { className: 'dm-compose', key: 'compose', onDrop: function (e) { e.preventDefault(); addFiles(e.dataTransfer.files) }, onDragOver: function (e) { e.preventDefault() } }, [
          h('textarea', {
            key: 'ta', ref: taRef, className: 'dm-ta', value: draft,
            placeholder: t('compose.ph'),
            onChange: function (e) { setDraft(e.target.value) },
            onKeyDown: onKeyDown, onPaste: onPaste,
          }),
          pending.length > 0 ? h('div', { className: 'dm-thumbs', key: 'th' }, pending.map(function (p, i) {
            return h('div', { className: 'dm-thumb', key: i }, [
              h('img', { src: p.dataUrl, key: 'i' }),
              h('button', { key: 'x', onClick: function () { setPending(function (arr) { return arr.filter(function (_, j) { return j !== i }) }) } }, '×'),
            ])
          })) : null,
          h('div', { className: 'dm-row', key: 'row' }, [
            h('button', { className: 'dm-btn', key: 'img', title: t('btn.imageTip'), onClick: function () { fileRef.current && fileRef.current.click() } },
              [h(Svg, { key: 'i', size: 13 }, [h('rect', { key: 1, x: 3, y: 3, width: 18, height: 18, rx: 2 }), h('circle', { key: 2, cx: 8.5, cy: 8.5, r: 1.5 }), h('path', { key: 3, d: 'M21 15l-5-5L5 21' })]), t('btn.image')]),
            h('input', {
              key: 'f', ref: fileRef, type: 'file', accept: 'image/*', multiple: true,
              style: { display: 'none' },
              onChange: function (e) { addFiles(e.target.files); e.target.value = '' },
            }),
            h('span', { className: 'dm-hint', key: 'h' }, t('compose.hint')),
            h('span', { className: 'dm-spacer', key: 's' }),
            h('button', { className: 'dm-btn pri', key: 'save', disabled: busy, onClick: save }, busy ? t('btn.saving') : t('btn.save')),
          ]),
        ]),

        h('div', { className: 'dm-filters', key: 'filters' }, filterChips.map(function (c) {
          return h('button', {
            key: c.k, className: 'dm-chip' + (filter === c.k ? ' on' : ''),
            onClick: function () { setFilter(c.k) },
          }, c.n !== undefined ? c.label + ' ' + c.n : c.label)
        })),

        // 标签区：全部标签可见，末尾常驻一句"怎么新建"，让自定义这件事是显式的
        h('div', { className: 'dm-tagbox', key: 'tagbox' }, [
          h('span', { key: 'lead', style: { opacity: .7 } }, t('tag.lead')),
        ].concat(tags.length === 0 ? [
          h('span', { className: 'dm-tagnew', key: 'none' }, t('tag.none')),
        ] : tags.map(function (tg) {
          return h('button', {
            key: 'tag-' + tg.name,
            className: 'dm-chip' + (tag === tg.name ? ' on' : ''),
            onClick: function () { toggleTag(tg.name) },
            title: t('tag.usedBy', { n: tg.count || 0 }),
          }, '#' + tg.name + (tg.count ? ' ' + tg.count : ''))
        })).concat([
          h('span', { className: 'dm-tagnew', key: 'howto', title: t('tag.newTip') }, t('tag.new')),
        ])),

        h('div', { className: 'dm-list', key: 'list' }, loading
          ? h('div', { className: 'dm-empty' }, t('empty.loading'))
          : (items.length === 0
            ? h('div', { className: 'dm-empty' }, [
              h(Svg, { key: 'i', size: 28 }, [h('path', { key: 1, d: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9l-5 5H6a2 2 0 0 1-2-2z' })]),
              h('div', { key: 't' }, q || tag || filter !== 'all' ? t('empty.filtered') : t('empty.none')),
            ])
            : grouped.map(function (g) {
              return h('div', { className: 'dm-group', key: 'g' + g.key }, [
                h('div', { className: 'dm-day', key: 'd' }, g.label),
                // 每组一个可拖拽容器：拖拽只在同一天内调整顺序（跨天的顺序语义继续交给置顶）
                h('div', {
                  className: 'dm-cards', key: 'c',
                  ref: function (el) { if (el) sortRefs.current[g.key] = el; else delete sortRefs.current[g.key] },
                }, g.items.map(function (it) {
              // 编辑态：卡片就地展开（不跳转、不弹层，上下文不丢）
              if (editId === it.id) {
                var thumbs = editKeep.map(function (a) {
                  return h('div', { className: 'dm-thumb', key: 'k' + a.id }, [
                    h('img', { key: 'i', src: a.url, alt: a.name || '' }),
                    h('button', { key: 'x', title: t('card.del'), onClick: function () {
                      setEditKeep(function (list) { return list.filter(function (k) { return k.id !== a.id }) })
                    } }, '\u00d7'),
                  ])
                }).concat(editNew.map(function (p, i) {
                  return h('div', { className: 'dm-thumb', key: 'n' + i }, [
                    h('img', { key: 'i', src: p.dataUrl }),
                    h('button', { key: 'x', title: t('card.del'), onClick: function () {
                      setEditNew(function (list) { return list.filter(function (_, j) { return j !== i }) })
                    } }, '\u00d7'),
                  ])
                }))
                return h('div', { className: 'dm-card editing', key: it.id },
                  h('div', { className: 'dm-edit' }, [
                    h('textarea', {
                      key: 'ta', className: 'dm-edit-ta', value: editBody,
                      placeholder: t('compose.ph'),
                      onChange: function (e) { setEditBody(e.target.value) },
                      onKeyDown: function (e) {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(it) }
                        if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                      },
                      onPaste: function (e) {
                        var items = (e.clipboardData && e.clipboardData.items) || []
                        var files = []
                        for (var i = 0; i < items.length; i++) {
                          if (items[i].type && items[i].type.indexOf('image/') === 0) {
                            var f = items[i].getAsFile(); if (f) files.push(f)
                          }
                        }
                        if (files.length > 0) { e.preventDefault(); addEditFiles(files) }
                      },
                    }),
                    thumbs.length > 0 ? h('div', { className: 'dm-thumbs', key: 'th' }, thumbs) : null,
                    h('div', { className: 'dm-edit-row', key: 'row' }, [
                      h('button', {
                        className: 'dm-btn', key: 'img', title: t('btn.imageTip'),
                        onClick: function () { editFileRef.current && editFileRef.current.click() },
                      }, [h(Svg, { key: 'i', size: 13 }, [
                        h('rect', { key: 1, x: 3, y: 3, width: 18, height: 18, rx: 2 }),
                        h('circle', { key: 2, cx: 8.5, cy: 8.5, r: 1.5 }),
                        h('path', { key: 3, d: 'M21 15l-5-5L5 21' }),
                      ]), t('btn.image')]),
                      h('input', {
                        key: 'f', ref: editFileRef, type: 'file', accept: 'image/*', multiple: true,
                        style: { display: 'none' },
                        onChange: function (e) { addEditFiles(e.target.files); e.target.value = '' },
                      }),
                      h('span', { className: 'dm-hint', key: 'h' }, t('edit.hint')),
                      h('span', { className: 'dm-spacer', key: 'sp' }),
                      h('button', { className: 'dm-btn', key: 'c', onClick: cancelEdit }, t('edit.cancel')),
                      h('button', {
                        className: 'dm-btn pri', key: 'ok', disabled: editBusy,
                        onClick: function () { saveEdit(it) },
                      }, editBusy ? t('btn.saving') : t('btn.save')),
                    ]),
                  ]))
              }
              return h('div', {
                className: 'dm-card' + (it.done ? ' done' : '') + (it.pinned ? ' pinned' : ''),
                key: it.id, 'data-id': it.id,
              }, [
                h('button', { className: 'dm-cb', key: 'cb', onClick: function () { toggleDone(it) }, title: it.done ? t('card.markUndone') : t('card.markDone') }, it.done ? h(Check, {}) : null),
                h('div', { className: 'dm-body', key: 'b' }, [
                  it.pinned ? h('div', { className: 'dm-pinrow', key: 'pin', title: t('card.pinned') }, [
                    h(Svg, { size: 11, key: 'i' }, [h('path', { key: 1, d: 'M12 17v5M9 3h6l-1 8 4 3H6l4-3z' })]),
                    h('span', { key: 't' }, t('card.pinned')),
                  ]) : null,
                  h('div', { className: 'dm-txt', key: 't' }, it.body),
                  h('div', { className: 'dm-meta', key: 'm' }, [
                    it.tags.map(function (tg) {
                      return h('span', { className: 'dm-tag', key: tg, onClick: function () { toggleTag(tg) } }, '#' + tg)
                    }),
                    it.source ? h('span', { key: 's' }, t('card.source', { source: it.source })) : null,
                    it.dueAt ? h('span', { key: 'dd' }, t('card.due', { date: it.dueAt })) : null,
                    h('span', { key: 'tm' }, fmtTime(it.createdAt, t)),
                  ]),
                  it.attachments && it.attachments.length > 0 ? h('div', { className: 'dm-imgs', key: 'im' }, it.attachments.map(function (a) {
                    return h('img', { key: a.id, src: a.url, onClick: function () { setZoom(a.url) }, alt: a.name || '' })
                  })) : null,
                ]),
                h('div', { className: 'dm-act', key: 'act' }, [
                  h('button', {
                    className: 'dm-ib', key: 'e', title: t('card.edit'),
                    onClick: function () { startEdit(it) },
                  }, h(Svg, { size: 13 }, [
                    h('path', { key: 1, d: 'M12 20h9' }),
                    h('path', { key: 2, d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' }),
                  ])),
                  h('button', {
                    className: 'dm-ib' + (it.pinned ? ' on' : ''), key: 'p',
                    title: it.pinned ? t('card.unpin') : t('card.pin'),
                    onClick: function () { call('update', { id: it.id, patch: { pinned: !it.pinned } }).then(refresh) },
                  }, h(Svg, { size: 13 }, [h('path', { key: 1, d: 'M12 17v5M9 3h6l-1 8 4 3H6l4-3z' })])),
                  h('button', { className: 'dm-ib', key: 'd', title: t('card.del'), onClick: function () { removeItem(it) } },
                    h(Svg, { size: 13 }, [h('path', { key: 1, d: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6' })])),
                ]),
              ])
                })),
              ])
            }))),

        zoom ? h('div', { className: 'dm-view', key: 'view', onClick: function () { setZoom('') } }, h('img', { src: zoom })) : null,

        // 同步结果通知：成功走成功色，失败走失败色
        toast ? h('div', { className: 'dm-toast ' + toast.kind, key: 'toast', role: 'status' }, [
          h(Svg, { key: 'i', size: 15 }, toast.kind === 'ok'
            ? [h('path', { key: 1, d: 'M20 6L9 17l-5-5' })]
            : [h('circle', { key: 1, cx: 12, cy: 12, r: 9 }), h('path', { key: 2, d: 'M12 8v5M12 16.6v.01' })]),
          h('span', { key: 't' }, toast.text),
        ]) : null,

        showCfg ? h('div', {
          className: 'dm-modal', key: 'cfg',
          onClick: function (e) { if (e.target === e.currentTarget) setShowCfg(false) },
        }, h('div', { className: 'dm-dlg' }, [
          h('h3', { key: 't' }, t('cfg.title')),
          h('div', { className: 'sub', key: 's' }, t('cfg.desc')),
          h('div', { className: 'dm-field', key: 'repo' }, [
            h('label', { key: 'l' }, t('cfg.repo')),
            h('input', {
              key: 'i', value: cfgRepo, placeholder: t('cfg.repoPh'),
              onChange: function (e) { setCfgRepo(e.target.value) },
            }),
            h('div', { className: 'help', key: 'h' }, t('cfg.repoHelp')),
          ]),
          h('div', { className: 'dm-field', key: 'token' }, [
            h('label', { key: 'l' }, t('cfg.token')),
            h('input', {
              key: 'i', type: 'password', value: cfgToken, placeholder: 'github_pat_… / ghp_…',
              onChange: function (e) { setCfgToken(e.target.value) },
            }),
            h('div', { className: 'help', key: 'h' }, t('cfg.tokenHelp')),
          ]),
          cfgMsg ? h('div', { className: 'help', key: 'm' }, cfgMsg) : null,
          h('div', { className: 'dm-dlgfoot', key: 'f' }, [
            h('button', { className: 'dm-btn pri', key: 'save', disabled: cfgBusy, onClick: saveCfg }, cfgBusy ? t('btn.saving') : t('cfg.save')),
            h('span', { className: 'dm-spacer', key: 'sp' }),
            h('button', { className: 'dm-btn', key: 'c', onClick: function () { setShowCfg(false) } }, t('cfg.close')),
          ]),
        ])) : null,
      ])
    }

    /* ---------------- 插件 ---------------- */

    function apply(ctx) {
      ctx.effect(function () { return ctx.locale.register(NS, DICT) }, 'dsh-memo: dictionaries')
      var tSlot = makeT(ctx.locale.bind(NS))

      var styleEl = document.createElement('style')
      styleEl.setAttribute('data-dsh-memo', '')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(function () { return function () { styleEl.remove() } }, 'dsh-memo: styles')

      ctx.slots.inject('main', function () {
        return ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, MemoPanel)
      })
      ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: function () { return tSlot('panel') },
        }, MemoIcon)
      })
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    return module.exports
  },
  })
} catch (error) {
  var memoRegisterMessage = String((error && error.message) || error)
  if (!/duplicate factory registration/.test(memoRegisterMessage)) throw error
}
