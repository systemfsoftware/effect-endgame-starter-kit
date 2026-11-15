import { describe, it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  PersonId,
  RenameTodo,
  renameTodo,
  type RenameTodoRefusal,
  Todo,
  TodoFound,
  TodoMissing,
  TodoNotFound,
  TodoRenamed,
  TodoStoreFailed,
  TodoStoreUnavailable,
  TodoTextMissing,
  TodoTextTooLong,
  Uuid,
} from '@endgame/site/todo'

const TEXT_CAP = 280
const ONLY_WHITESPACE = /^\s*$/
const ONE_NON_WHITESPACE_CODE_UNIT = /^\S$/

type Renamed = Result.Result<TodoRenamed, RenameTodoRefusal>

const sameTodo = (todo: Todo, other: Todo): boolean =>
  todo.id === other.id &&
  todo.text === other.text &&
  todo.done === other.done &&
  todo.position === other.position &&
  todo.version === other.version &&
  todo.createdAt === other.createdAt

const renamedAs = (outcome: Renamed, expected: Todo): boolean =>
  Result.match(outcome, {
    onSuccess: (renamed) => sameTodo(renamed.todo, expected),
    onFailure: () => false,
  })

const conflictAs = (outcome: Renamed, expected: number, actual: number): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) =>
      Match.value(refused).pipe(
        Match.tag('TodoVersionConflict', (conflict) => conflict.expected === expected && conflict.actual === actual),
        Match.orElse(() => false),
      ),
  })

const refusedAs = (outcome: Renamed, isRefusal: (refused: RenameTodoRefusal) => boolean): boolean =>
  Result.match(outcome, {
    onSuccess: () => false,
    onFailure: (refused) => isRefusal(refused) && refused.message !== '',
  })

describe('Feature: a todo is renamed with its text trimmed at the next version, or the rename is refused', () => {
  it.prop(
    '∀d_Renamed_=TrimmedTextAtTheNextVersion',
    {
      of: {
        todo: Todo,
        version: S.Int,
        lead: S.String.check(S.isPattern(ONLY_WHITESPACE)),
        trail: S.String.check(S.isPattern(ONLY_WHITESPACE)),
        person: PersonId,
      },
      subject: renameTodo,
    },
    (subject, { todo, version, lead, trail, person }) => {
      const outcome = subject(
        new RenameTodo({
          person,
          id: todo.id,
          version,
          text: `${lead}buy milk${trail}`,
          probe: new TodoFound({ todo }),
        }),
      )
      return Match.value(todo.version === version).pipe(
        Match.when(true, () => renamedAs(outcome, { ...todo, text: 'buy milk', version: todo.version + 1 })),
        Match.when(false, () => conflictAs(outcome, version, todo.version)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Refusal_=TextMissingForBlankText',
    {
      of: {
        todo: Todo,
        version: S.Int,
        blank: S.String.check(S.isPattern(ONLY_WHITESPACE)),
        person: PersonId,
      },
      subject: renameTodo,
    },
    (subject, { todo, version, blank, person }) => {
      const outcome = subject(
        new RenameTodo({ person, id: todo.id, version, text: blank, probe: new TodoFound({ todo }) }),
      )
      return Match.value(todo.version === version).pipe(
        Match.when(true, () => refusedAs(outcome, S.is(TodoTextMissing))),
        Match.when(false, () => conflictAs(outcome, version, todo.version)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Refusal_=TextTooLongPastTheCap',
    {
      of: {
        todo: Todo,
        version: S.Int,
        glyph: S.String.check(S.isPattern(ONE_NON_WHITESPACE_CODE_UNIT)),
        person: PersonId,
      },
      subject: renameTodo,
    },
    (subject, { todo, version, glyph, person }) => {
      const outcome = subject(
        new RenameTodo({
          person,
          id: todo.id,
          version,
          text: glyph.repeat(TEXT_CAP + 1),
          probe: new TodoFound({ todo }),
        }),
      )
      return Match.value(todo.version === version).pipe(
        Match.when(true, () => refusedAs(outcome, S.is(TodoTextTooLong))),
        Match.when(false, () => conflictAs(outcome, version, todo.version)),
        Match.exhaustive,
      )
    },
  )

  it.prop(
    '∀d_Refusal_=NotFoundOnMissingTodo',
    { of: { id: Uuid, version: S.Int, person: PersonId }, subject: renameTodo },
    (subject, { id, version, person }) =>
      refusedAs(
        subject(new RenameTodo({ person, id, version, text: 'buy milk', probe: new TodoMissing({ id }) })),
        S.is(TodoNotFound),
      ),
  )

  it.prop(
    '∀d_Refusal_=StoreUnavailableOnFailedRead',
    { of: { id: Uuid, version: S.Int, person: PersonId, detail: S.String }, subject: renameTodo },
    (subject, { id, version, person, detail }) =>
      refusedAs(
        subject(new RenameTodo({ person, id, version, text: 'buy milk', probe: new TodoStoreFailed({ detail }) })),
        S.is(TodoStoreUnavailable),
      ),
  )
})
