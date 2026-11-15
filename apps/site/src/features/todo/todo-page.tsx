import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { type KeyboardEvent, type SubmitEvent, useEffect, useRef, useState } from 'react'

import {
  addTodo,
  completeTodo,
  listTodos,
  removeTodo,
  renameTodo,
  reorderTodo,
  type TodoFailure,
  type TodoView,
} from './todo-client'
import { newId } from './todo-ids'

const EMPTY_NOTICE = 'Nothing on the list yet. Add the first thing.'
const TEXT_NOTICE = 'Write what the todo is.'

const noticeOf = (failure: TodoFailure): string =>
  Match.value(failure).pipe(
    Match.tag('TodoTextMissing', (refusal) => refusal.message),
    Match.tag('TodoTextTooLong', (refusal) => refusal.message),
    Match.tag('TodoRateLimited', (refusal) => refusal.message),
    Match.tag('TodoNotFound', (refusal) => refusal.message),
    Match.tag('TodoNotMovable', (refusal) => refusal.message),
    Match.tag('TodoVersionConflict', (refusal) => refusal.message),
    Match.tag('TodoStoreUnavailable', (refusal) => refusal.message),
    Match.tag('RpcClientError', () => 'The server did not answer.'),
    Match.exhaustive,
  )

const replaceTodo = (todos: ReadonlyArray<TodoView>, updated: TodoView): ReadonlyArray<TodoView> =>
  todos.map((todo) => (todo.id === updated.id ? updated : todo))

const applyAdded = (
  todos: ReadonlyArray<TodoView>,
  optimisticId: string,
  added: TodoView,
): ReadonlyArray<TodoView> => {
  const index = todos.findIndex((todo) => todo.id === optimisticId)
  return index === -1 ? [...todos, added] : [...todos.slice(0, index), added, ...todos.slice(index + 1)]
}

const neighbourIndex = (index: number, direction: 'up' | 'down'): number => direction === 'up' ? index - 1 : index + 1

const moved = (todos: ReadonlyArray<TodoView>, todo: TodoView, direction: 'up' | 'down'): ReadonlyArray<TodoView> => {
  const index = todos.findIndex((candidate) => candidate.id === todo.id)
  const target = neighbourIndex(index, direction)
  const withinList = target >= 0 && target < todos.length
  const without = todos.filter((candidate) => candidate.id !== todo.id)
  return Match.value(withinList).pipe(
    Match.when(true, () => [...without.slice(0, target), todo, ...without.slice(target)]),
    Match.orElse(() => todos),
  )
}

const doneMark = (todo: TodoView): string => (todo.done ? '✓' : '')

const doneLabel = (todo: TodoView): string => (todo.done ? `Mark ${todo.text} not done` : `Mark ${todo.text} done`)

const isEmpty = (todos: ReadonlyArray<TodoView>, ready: boolean): boolean => todos.length === 0 && ready

const FIELD_TAGS: ReadonlyArray<string> = ['INPUT', 'TEXTAREA']

const inField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && FIELD_TAGS.includes(target.tagName)

const isComposerShortcut = (event: globalThis.KeyboardEvent): boolean => event.key === 'n' && !inField(event.target)

const focusComposer = (input: HTMLInputElement | null): void => {
  if (input !== null) input.focus()
}

interface TodoDisplayProps {
  readonly todo: TodoView
  readonly index: number
  readonly total: number
  readonly onComplete: () => void
  readonly onMoveUp: () => void
  readonly onMoveDown: () => void
  readonly onRename: () => void
  readonly onRemove: () => void
}

function TodoDisplay(props: TodoDisplayProps) {
  return (
    <>
      <button
        className='todo__check'
        type='button'
        aria-label={doneLabel(props.todo)}
        aria-pressed={props.todo.done}
        onClick={props.onComplete}
      >
        <span aria-hidden='true'>{doneMark(props.todo)}</span>
      </button>
      <span className='todo__text'>{props.todo.text}</span>
      <span className='todo__actions'>
        <button
          className='todo__action'
          type='button'
          aria-label={`Move ${props.todo.text} up`}
          disabled={props.index === 0}
          onClick={props.onMoveUp}
        >
          ↑
        </button>
        <button
          className='todo__action'
          type='button'
          aria-label={`Move ${props.todo.text} down`}
          disabled={props.index === props.total - 1}
          onClick={props.onMoveDown}
        >
          ↓
        </button>
        <button
          className='todo__action'
          type='button'
          aria-label={`Rename ${props.todo.text}`}
          onClick={props.onRename}
        >
          ✎
        </button>
        <button
          className='todo__action todo__action--danger'
          type='button'
          aria-label={`Delete ${props.todo.text}`}
          onClick={props.onRemove}
        >
          ✕
        </button>
      </span>
    </>
  )
}

interface TodoEditorProps {
  readonly todo: TodoView
  readonly text: string
  readonly onText: (text: string) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  readonly onBlur: () => void
}

function TodoEditor(props: TodoEditorProps) {
  return (
    <input
      className='todo__edit'
      type='text'
      autoComplete='off'
      aria-label={`Rename ${props.todo.text}`}
      value={props.text}
      onChange={(event) => props.onText(event.target.value)}
      onKeyDown={props.onKeyDown}
      onBlur={props.onBlur}
    />
  )
}

interface TodoItemProps {
  readonly todo: TodoView
  readonly index: number
  readonly total: number
  readonly editing: boolean
  readonly editText: string
  readonly onEditText: (text: string) => void
  readonly onEditKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  readonly onEditBlur: () => void
  readonly onComplete: () => void
  readonly onMoveUp: () => void
  readonly onMoveDown: () => void
  readonly onRename: () => void
  readonly onRemove: () => void
}

function TodoItem(props: TodoItemProps) {
  return (
    <li className='todo__item' data-done={String(props.todo.done)}>
      {props.editing
        ? (
          <TodoEditor
            todo={props.todo}
            text={props.editText}
            onText={props.onEditText}
            onKeyDown={props.onEditKeyDown}
            onBlur={props.onEditBlur}
          />
        )
        : (
          <TodoDisplay
            todo={props.todo}
            index={props.index}
            total={props.total}
            onComplete={props.onComplete}
            onMoveUp={props.onMoveUp}
            onMoveDown={props.onMoveDown}
            onRename={props.onRename}
            onRemove={props.onRemove}
          />
        )}
    </li>
  )
}

export function TodoPage() {
  const [todos, setTodos] = useState<ReadonlyArray<TodoView>>([])
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [ready, setReady] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const program = listTodos.pipe(Effect.catchCause(() => Effect.succeed<ReadonlyArray<TodoView>>([])))
    void Effect.runPromise(program).then((loaded) => {
      setTodos(loaded)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isComposerShortcut(event)) {
        event.preventDefault()
        focusComposer(inputRef.current)
      }
    }
    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [])

  const attempt = <A,>(
    effect: Effect.Effect<A, TodoFailure>,
    onSuccess: (value: A) => void,
    onFailure: (failure: TodoFailure) => void,
  ): void => {
    const settled = Effect.result(effect)
    void Effect.runPromise(settled).then((outcome) =>
      Result.match(outcome, {
        onSuccess: (value) => {
          setNotice('')
          onSuccess(value)
        },
        onFailure: (failure) => {
          setNotice(noticeOf(failure))
          onFailure(failure)
        },
      })
    )
  }

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = draft.trim()
    if (text === '') {
      setNotice(TEXT_NOTICE)
      return
    }
    const optimistic: TodoView = {
      id: newId(),
      text,
      done: false,
      position: todos.length,
      version: 1,
      createdAt: 0,
    }
    setTodos((current) => [...current, optimistic])
    setDraft('')
    attempt(
      addTodo({ text }),
      (added) => setTodos((current) => applyAdded(current, optimistic.id, added)),
      () => setTodos((current) => current.filter((todo) => todo.id !== optimistic.id)),
    )
  }

  const complete = (todo: TodoView) => {
    const done = !todo.done
    setTodos((current) => replaceTodo(current, { ...todo, done }))
    attempt(
      completeTodo({ id: todo.id, version: todo.version, done }),
      (completed) => setTodos((current) => replaceTodo(current, completed)),
      () => setTodos((current) => replaceTodo(current, todo)),
    )
  }

  const rename = (todo: TodoView) => {
    const text = editText.trim()
    if (text === '') {
      setNotice(TEXT_NOTICE)
      return
    }
    setEditing(null)
    setTodos((current) => replaceTodo(current, { ...todo, text }))
    attempt(
      renameTodo({ id: todo.id, version: todo.version, text }),
      (renamed) => setTodos((current) => replaceTodo(current, renamed)),
      () => setTodos((current) => replaceTodo(current, todo)),
    )
  }

  const reorder = (todo: TodoView, direction: 'up' | 'down') => {
    const previous = todos
    setTodos((current) => moved(current, todo, direction))
    attempt(
      reorderTodo({ id: todo.id, version: todo.version, direction }),
      (reordered) => setTodos(reordered),
      () => setTodos(previous),
    )
  }

  const remove = (todo: TodoView) => {
    const previous = todos
    setTodos((current) => current.filter((candidate) => candidate.id !== todo.id))
    attempt(
      removeTodo({ id: todo.id, version: todo.version }),
      () => {},
      () => setTodos(previous),
    )
  }

  const startRename = (todo: TodoView) => {
    setEditing(todo.id)
    setEditText(todo.text)
  }

  const cancelRename = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(null)
    }
  }

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>, todo: TodoView) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      rename(todo)
    }
    cancelRename(event)
  }

  return (
    <main className='todo'>
      <header className='todo__header'>
        <h1 className='todo__title'>Todos</h1>
        <p className='todo__hint'>
          Press <kbd>n</kbd> to add a todo.
        </p>
      </header>

      <form className='todo__composer' onSubmit={submit}>
        <label className='visually-hidden' htmlFor='todo-new'>
          New todo
        </label>
        <input
          id='todo-new'
          ref={inputRef}
          className='todo__input'
          type='text'
          autoComplete='off'
          placeholder='What needs doing?'
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className='todo__add' type='submit' disabled={!ready}>
          Add
        </button>
      </form>

      <p className='todo__notice' role='status' aria-live='polite'>
        {notice}
      </p>

      <ol className='todo__list' aria-label='Todos'>
        {todos.map((todo, index) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            index={index}
            total={todos.length}
            editing={editing === todo.id}
            editText={editText}
            onEditText={setEditText}
            onEditKeyDown={(event) => onRenameKey(event, todo)}
            onEditBlur={() => rename(todo)}
            onComplete={() => complete(todo)}
            onMoveUp={() => reorder(todo, 'up')}
            onMoveDown={() => reorder(todo, 'down')}
            onRename={() => startRename(todo)}
            onRemove={() => remove(todo)}
          />
        ))}
      </ol>

      <p className='todo__empty' hidden={!isEmpty(todos, ready)}>
        {EMPTY_NOTICE}
      </p>
    </main>
  )
}
