window.__ModuleLoader__.load({
  id: 'dsh-haier-disclaimer',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')

    const DEFAULT_TEXT = '【本次问答结果来源于海尔公开信息，仅供参考！】'

    function Disclaimer({ matched }) {
      return react.createElement('p', {
        style: {
          marginTop: '12px',
          marginBottom: 0,
          fontSize: '12px',
          lineHeight: '20px',
          color: 'var(--dsw-alias-label-tertiary, #888)',
        },
      }, matched)
    }

    exports.inject = ['slots']

    exports.apply = function apply(ctx, config) {
      const text = (config && config.text) || DEFAULT_TEXT
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        id: 'haier-disclaimer',
        priority: -10,
        select: () => text,
      }, Disclaimer))
    }

    return module.exports
  },
})
