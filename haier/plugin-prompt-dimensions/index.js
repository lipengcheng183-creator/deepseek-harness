/**
 * plugin-prompt-dimensions — 按 7 个维度注入 agent 系统提示词，并注册演示 skill。
 *
 * identity 必须走 agent.ctx 遮蔽全局 `deployment:persona`（全局再注册会冲突）。
 * 其余 6 维用独立 section 名，挂在全局 systemPrompt 上。
 * 演示 skill：`geam-demo`（runtime 注册，模型可通过 skill 工具加载）。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'plugin-prompt-dimensions'
export const inject = ['systemPrompt', 'skills']

/** @typedef {import('@deepseek-ai/cordis').Context} Context */

/**
 * @typedef {Object} DimensionConfig
 * @property {string} [identity]
 * @property {string} [execution_bias]
 * @property {string} [communication]
 * @property {string} [tool_usage]
 * @property {string} [business_context]
 * @property {string} [business_rules]
 * @property {string} [knowledge_usage]
 */

/**
 * @typedef {DimensionConfig & { enabled?: boolean }} Config
 */

const PERSONA_SECTION = 'deployment:persona'
const PERSONA_ORDER = 0
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const DEMO_SKILL_PATH = join(PLUGIN_DIR, 'skills', 'geam-demo', 'SKILL.md')

/** 除 identity 外的全局段落（名称不得与框架已占用的冲突） */
const GLOBAL_DIMENSIONS = [
  {
    key: 'execution_bias',
    name: 'agent-prompt:execution-bias',
    order: 10,
    title: '执行偏置',
  },
  {
    key: 'communication',
    name: 'agent-prompt:communication',
    order: 20,
    title: '沟通风格',
  },
  {
    key: 'tool_usage',
    name: 'agent-prompt:tool-usage',
    order: 30,
    title: '工具策略',
  },
  {
    key: 'business_context',
    name: 'agent-prompt:business-context',
    order: 40,
    title: '业务背景',
  },
  {
    key: 'business_rules',
    name: 'agent-prompt:business-rules',
    order: 50,
    title: '业务红线',
  },
  {
    key: 'knowledge_usage',
    name: 'agent-prompt:knowledge-usage',
    order: 60,
    title: '知识使用边界',
  },
]

/**
 * @param {string | undefined} text
 * @param {string} title
 * @returns {string}
 */
function formatSection(text, title) {
  const body = typeof text === 'string' ? text.trim() : ''
  if (!body) return ''
  return `## ${title}\n\n${body}`
}

/**
 * Parse a simple SKILL.md with YAML frontmatter (name/description) + body.
 * @param {string} raw
 * @returns {{ name: string, description: string, content: string }}
 */
function parseSkillMarkdown(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    throw new Error(`plugin-prompt-dimensions: invalid SKILL.md at ${DEMO_SKILL_PATH}`)
  }
  const front = match[1]
  const content = match[2].trim()
  const name = front.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = front.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  if (!name || !description) {
    throw new Error('plugin-prompt-dimensions: SKILL.md requires name and description')
  }
  return { name, description, content }
}

/**
 * @param {Context} ctx
 * @param {Config} [config]
 */
export function apply(ctx, config = {}) {
  if (config.enabled === false) return

  // 演示 skill：模型可用 skill 工具加载
  const skill = parseSkillMarkdown(readFileSync(DEMO_SKILL_PATH, 'utf8'))
  ctx.effect(() => ctx.skills.register({
    name: skill.name,
    description: skill.description,
    source: 'runtime',
    path: DEMO_SKILL_PATH,
    content: skill.content,
  }), 'plugin-prompt-dimensions:geam-demo-skill')

  // 1. identity：每个 agent 创建时在 agent.ctx 遮蔽 deployment:persona
  const identityText = formatSection(config.identity, '身份')
  if (identityText) {
    ctx.on('agent/created', ({ agent }) => {
      agent.ctx.systemPrompt.section({
        name: PERSONA_SECTION,
        order: PERSONA_ORDER,
        text: identityText,
      })
    })
  }

  // 2–7：全局独立段落
  for (const dim of GLOBAL_DIMENSIONS) {
    const text = formatSection(config[dim.key], dim.title)
    if (!text) continue

    ctx.effect(() => ctx.systemPrompt.section({
      name: dim.name,
      order: dim.order,
      text,
    }), `plugin-prompt-dimensions:${dim.key}`)
  }
}
