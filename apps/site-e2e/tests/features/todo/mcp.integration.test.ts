import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'

import { McpClientLive, throughTheTools } from './__fixtures__/mcp.fixture'

const Feature = makeFeature({ it })

const MCP_TIMEOUT_MS = 60_000

Feature('Working with the todos over the MCP surface', { timeout: MCP_TIMEOUT_MS })
  .withLayer(McpClientLive)
  .live('the running Worker serves the todo tools it derives from the todo contract')
  .body(({ scenario }) => {
    scenario(
      'An agent lists the todo tools and adds a todo it can then list',
      Gherkin.Do.pipe(
        When('the agent calls the todo tools')('outcome', () => throughTheTools),
        Then('the todo tools are offered and the added todo comes back from the list')((s, expect) =>
          expect({
            tools: s.outcome.tools,
            added: s.outcome.added,
            listed: s.outcome.listed,
          }).toEqual({
            tools: [
              'todo_list',
              'todo_add',
              'todo_complete',
              'todo_rename',
              'todo_reorder',
              'todo_remove',
            ],
            added: {
              todo: {
                id: expect.any(String),
                text: 'buy milk',
                done: false,
                position: 0,
                version: 1,
                createdAt: expect.any(Number),
              },
            },
            listed: [
              {
                id: expect.any(String),
                text: 'buy milk',
                done: false,
                position: 0,
                version: 1,
                createdAt: expect.any(Number),
              },
            ],
          })
        ),
      ),
    )
  })
