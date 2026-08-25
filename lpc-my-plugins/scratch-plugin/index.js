/**
 * scratch greet tool — 教程里的可配置 greet 工具。
 * 从 my-plugin.ts 收成可安装 bundle，便于 profile 安装。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ greeting?: string }} [config]
 */
export function apply(ctx, config = {}) {
  const greeting = typeof config.greeting === 'string' && config.greeting.trim()
    ? config.greeting.trim()
    : 'Hello'

  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `${greeting}, ${args.name}!`
    },
  }))
}
