import { Cell } from '@systemfsoftware/effect-cell-types'
import {
  FsPath,
  type MemberRefusal,
  PackageVersion,
  type RepoRoot,
  SurfaceStore,
  type TargetSuffix,
  type VersionRefusal,
  WorkspaceStore,
} from '@systemfsoftware/release-language'
import { Effect } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import {
  PinName,
  PinnedManifest,
  PinRootManifestCommand,
  type PinRootManifestInput,
} from './pin-root-manifest.schema.js'
import { type PinDecision, PinManifestInvalid, type PinRefusal, pinRootManifest } from './pin-root-manifest.workflow.js'

const INDENT = /^(\s+)"/m

const pinIndentOf = (text: string): string | number => text.match(INDENT)?.[1] ?? 2

const availableVersionOf = (given: string | undefined): PackageVersion | undefined => {
  if (given === undefined) return undefined
  return Result.getOrUndefined(S.decodeUnknownResult(PackageVersion)(given))
}

const pinNamesOf = (
  suffixes: ReadonlyArray<TargetSuffix> | undefined,
  name: string,
): ReadonlyArray<PinName> => {
  if (suffixes === undefined) return []
  return suffixes.map((suffix) => PinName.make(`${name}-${suffix}`))
}

const parseCommand = (
  request: PinRootManifestInput,
  text: string,
  root: RepoRoot,
): Result.Result<PinRootManifestCommand, PinManifestInvalid | S.SchemaError> =>
  Result.flatMap(
    Result.mapError(
      S.decodeUnknownResult(S.fromJsonString(S.Unknown))(text),
      (error) =>
        PinManifestInvalid.make({
          path: FsPath.make(request.manifest),
          reason: error.message,
        }),
    ),
    (parsed) =>
      Result.flatMap(
        S.decodeUnknownResult(S.Record(S.String, S.Unknown))(parsed),
        (manifest) =>
          Result.map(
            S.decodeUnknownResult(PinnedManifest)(manifest),
            (pinned) =>
              PinRootManifestCommand.make({
                manifestText: text,
                manifest,
                path: request.manifest,
                packageName: pinned.name,
                indent: pinIndentOf(text),
                trailingNewline: text.endsWith('\n'),
                requestedVersion: request.requestedVersion,
                requestedUsable: availableVersionOf(request.requestedVersion),
                declaredVersion: pinned.version,
                declaredUsable: availableVersionOf(pinned.version),
                suffixes: request.suffixes,
                pinNames: pinNamesOf(request.suffixes, pinned.name),
                repoRoot: root,
                dryRun: request.dryRun,
              }),
          ),
      ),
  )

const read = (
  request: PinRootManifestInput,
): Effect.Effect<
  PinRootManifestCommand,
  MemberRefusal | PinManifestInvalid | S.SchemaError,
  WorkspaceStore
> =>
  Effect.gen(function*() {
    const workspace = yield* WorkspaceStore
    const file = yield* workspace.readFileFromRoot(request.manifest)
    return yield* Effect.fromResult(parseCommand(request, file.text, workspace.root))
  })

const write = (
  output: Result.Result<PinDecision, PinRefusal>,
  command: PinRootManifestCommand,
): Effect.Effect<PinDecision, PinRefusal | VersionRefusal, SurfaceStore> => {
  if (Result.isFailure(output)) return Effect.fail(output.failure)
  return Match.value(output.success).pipe(
    Match.tag('WorkspaceVersionAlreadyCurrent', (current) => Effect.succeed(current)),
    Match.tag('WorkspaceVersionRepinned', (repinned) =>
      Effect.gen(function*() {
        if (command.dryRun === true) return repinned
        const surfaces = yield* SurfaceStore
        yield* surfaces.writeRootManifest(command.path, repinned.text)
        return repinned
      })),
    Match.exhaustive,
  )
}

export const pinRootManifestCell: Cell.Cell<
  PinRootManifestInput,
  PinDecision,
  MemberRefusal | PinManifestInvalid | S.SchemaError | PinRefusal | VersionRefusal,
  WorkspaceStore | SurfaceStore
> = Cell.layer({
  read,
  decide: pinRootManifest,
  write,
})
