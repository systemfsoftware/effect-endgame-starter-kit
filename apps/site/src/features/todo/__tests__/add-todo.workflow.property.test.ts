import { describe, it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Num from 'effect/Number'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  AddTodo,
  addTodo,
  type AddTodoRefusal,
  PersonId,
  type Todo,
  TodoAdded,
  TodoRateLimited,
  Todos,
  TodosRead,
  TodoTextMissing,
  TodoTextTooLong,
  Uuid,
} from '@endgame/site/todo'

const CREATES_PER_MINUTE = 30
const CREATES_WINDOW_MS = 60_000
const TEXT_CAP = 280
const ONE_NON_WHITESPACE_CODE_UNIT = /^\S$/

type Added = Result.Result<TodoAdded, AddTodoRefusal>

const sameTodo = (todo: Todo, other: Todo): boolean =>
  todo.id === other.id &&
  todo.text === other.text &&
  todo.done === other.done &&
  todo.position === other.position &&
  todo.version === other.version &&
  todo.createdAt === other.createdAt

const addedAs = (outcome: Added, expected: Todo): boolean =>
  Result.match(outcome, {
    onSuccess: (added) => sameTodo(added.todo, expected),
    onFailure: () => false,
  })

const refusedAs = (outcome: Added, isRefusal: (refused: AddTodoRefusal) => boolean): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) => isRefusal(refused) && refused.message !== '',
  })

const staleOf = (todos: Todos, now: number): Todos =>
  todos.map((todo) => ({ ...todo, createdAt: now - CREATES_WINDOW_MS }))

const uuidOf = (index: number): string => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`

const recentOf = (now: number, count: number): Todos =>
  Array.from({ length: count }, (_, index) => ({
    id: uuidOf(index),
    text: `todo ${index}`,
    done: false,
    position: index,
    version: 1,
    createdAt: now,
  }))

const nextPositionOf = (todos: Todos): number =>
  todos.reduce((highest, todo) => Num.max(highest, todo.position), -1) + 1

describe('Feature: a todo is added trimmed at the next position, or the add is refused for its first fault', () => {
  it.prop(
    '∀d_Outcome_=TrimmedTextOrItsRefusal',
    { of: { todos: Todos, text: S.String, now: S.Int, id: Uuid, person: PersonId }, subject: addTodo },
    (subject, { todos, text, now, id, person }) => {
      const stale = staleOf(todos, now)
      const outcome = subject(new AddTodo({ person, text, id, now, probe: new TodosRead({ todos: stale }) }))
      const trimmed = text.trim()
      return Match.value(trimmed.length).pipe(
        Match.when(0, () => refusedAs(outcome, S.is(TodoTextMissing))),
        Match.when((length) => length > TEXT_CAP, () => refusedAs(outcome, S.is(TodoTextTooLong))),
        Match.orElse(() =>
          addedAs(outcome, {
            id,
            text: trimmed,
            done: false,
            position: nextPositionOf(stale),
            version: 1,
            createdAt: now,
          })
        ),
      )
    },
  )

  it.prop(
    '∀d_Refusal_=TextTooLongPastTheCap',
    {
      of: {
        todos: Todos,
        glyph: S.String.check(S.isPattern(ONE_NON_WHITESPACE_CODE_UNIT)),
        now: S.Int,
        id: Uuid,
        person: PersonId,
      },
      subject: addTodo,
    },
    (subject, { todos, glyph, now, id, person }) => {
      const stale = staleOf(todos, now)
      const outcome = subject(
        new AddTodo({ person, text: glyph.repeat(TEXT_CAP + 1), id, now, probe: new TodosRead({ todos: stale }) }),
      )
      return refusedAs(outcome, S.is(TodoTextTooLong))
    },
  )

  it.prop(
    '∀d_Refusal_=RateLimitedAtTheCap',
    {
      of: {
        text: S.String.check(S.isPattern(ONE_NON_WHITESPACE_CODE_UNIT)),
        now: S.Int,
        id: Uuid,
        person: PersonId,
      },
      subject: addTodo,
    },
    (subject, { text, now, id, person }) => {
      const outcome = subject(
        new AddTodo({ person, text, id, now, probe: new TodosRead({ todos: recentOf(now, CREATES_PER_MINUTE) }) }),
      )
      return refusedAs(outcome, S.is(TodoRateLimited))
    },
  )

  it.prop(
    '∀d_Accepted_=CreateOutsideTheWindow',
    {
      of: {
        text: S.String.check(S.isPattern(ONE_NON_WHITESPACE_CODE_UNIT)),
        now: S.Int,
        id: Uuid,
        person: PersonId,
      },
      subject: addTodo,
    },
    (subject, { text, now, id, person }) => {
      const outside = recentOf(now, CREATES_PER_MINUTE).map((todo) => ({
        ...todo,
        createdAt: now - CREATES_WINDOW_MS,
      }))
      const outcome = subject(new AddTodo({ person, text, id, now, probe: new TodosRead({ todos: outside }) }))
      return addedAs(outcome, {
        id,
        text,
        done: false,
        position: nextPositionOf(outside),
        version: 1,
        createdAt: now,
      })
    },
  )
})
