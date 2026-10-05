import { Workflow } from '@systemfsoftware/effect-cell-types'
import {
  Count,
  DecisionTypeId,
  PackageName,
  PackageVersion,
  RelativePath,
  type VersionIntentMalformed,
  type VersionUnknownPackage,
} from '@systemfsoftware/release-language'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { BumpCommand } from './bump.schema.js'

export class VersionBumped extends S.TaggedClass<VersionBumped>()(
  'VersionBumped',
  {
    version: PackageVersion,
    moved: S.Array(PackageName),
    changelogs: S.Array(RelativePath),
  },
) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class VersionConsumed extends S.TaggedClass<VersionConsumed>()(
  'VersionConsumed',
  {
    consumed: Count,
  },
) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export class VersionIdle extends S.TaggedClass<VersionIdle>()(
  'VersionIdle',
  {
    pending: Count,
  },
) {
  readonly [DecisionTypeId] = DecisionTypeId
}

export type VersionDecision = VersionBumped | VersionConsumed | VersionIdle

const NoIntentsCase = S.TaggedStruct('NoIntents', { pending: Count })
const UnknownPackageCase = S.TaggedStruct('UnknownPackage', { package: PackageName })
const IntentMalformedCase = S.TaggedStruct('IntentMalformed', { path: RelativePath })
const OnlyNoneCase = S.TaggedStruct('OnlyNone', { count: Count })
const BumpedCase = S.TaggedStruct('Bumped', {
  version: PackageVersion,
  moved: S.Array(PackageName),
  changelogs: S.Array(RelativePath),
})

type NoIntentsCase = S.Schema.Type<typeof NoIntentsCase>
type UnknownPackageCase = S.Schema.Type<typeof UnknownPackageCase>
type IntentMalformedCase = S.Schema.Type<typeof IntentMalformedCase>
type OnlyNoneCase = S.Schema.Type<typeof OnlyNoneCase>
type BumpedCase = S.Schema.Type<typeof BumpedCase>

type BumpCase =
  | NoIntentsCase
  | UnknownPackageCase
  | IntentMalformedCase
  | OnlyNoneCase
  | BumpedCase

const CORE_PATTERN = /^(\d+)\.(\d+)\.(\d+)/
const CORE_WIDTH = 12

const coreKeyOf = (version: string): string => {
  const hit = CORE_PATTERN.exec(version)
  if (hit === null) return '0'.repeat(CORE_WIDTH * 3)
  return hit.slice(1, 4).map((part) => part.padStart(CORE_WIDTH, '0')).join('')
}

const highestCoreOf = (
  versions: ReadonlyArray<PackageVersion>,
): PackageVersion | undefined => [...versions].sort((left, right) => coreKeyOf(right).localeCompare(coreKeyOf(left)))[0]

const bumpedVersionOf = (command: BumpCommand): PackageVersion => {
  if (command.strategy === 'surfaces') return command.consolidatedNext
  const highest = highestCoreOf(command.nexts.map((entry) => entry.next))
  if (highest === undefined) return command.consolidatedNext
  return highest
}

const bumpCaseOf = (command: BumpCommand): BumpCase => {
  if (command.intents.length === 0) return NoIntentsCase.make({ pending: command.intentCount })
  if (command.unknownPackage !== undefined) {
    return UnknownPackageCase.make({ package: command.unknownPackage })
  }
  if (command.malformedPath !== undefined) {
    return IntentMalformedCase.make({ path: command.malformedPath })
  }
  if (command.consolidated === 'none') return OnlyNoneCase.make({ count: command.intentCount })
  return BumpedCase.make({
    version: bumpedVersionOf(command),
    moved: [...command.moved],
    changelogs: command.changelogPaths.map((entry) => entry.path),
  })
}

export const bumpVersions: Workflow.Workflow<
  BumpCommand,
  VersionDecision,
  VersionUnknownPackage | VersionIntentMalformed
> = Workflow.make(
  BumpCommand,
  (
    command,
  ): Result.Result<
    VersionDecision,
    VersionUnknownPackage | VersionIntentMalformed
  > =>
    Match.value(bumpCaseOf(command)).pipe(
      Match.tag(
        'NoIntents',
        (none) => Result.succeed(VersionIdle.make({ pending: none.pending })),
      ),
      Match.tag(
        'UnknownPackage',
        (unknown): Result.Result<never, VersionUnknownPackage> =>
          Result.fail({ _tag: 'VersionUnknownPackage', package: unknown.package }),
      ),
      Match.tag(
        'IntentMalformed',
        (malformed): Result.Result<never, VersionIntentMalformed> =>
          Result.fail({ _tag: 'VersionIntentMalformed', path: malformed.path }),
      ),
      Match.tag(
        'OnlyNone',
        (none) => Result.succeed(VersionConsumed.make({ consumed: none.count })),
      ),
      Match.tag(
        'Bumped',
        (bumped) =>
          Result.succeed(VersionBumped.make({
            version: bumped.version,
            moved: [...bumped.moved],
            changelogs: [...bumped.changelogs],
          })),
      ),
      Match.exhaustive,
    ),
)
