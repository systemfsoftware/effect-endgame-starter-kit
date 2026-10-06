import { NodeFileSystem } from '@effect/platform-node'
import {
  HoldTtl,
  memoryStore,
  PersonId,
  Register,
  registerCell,
  RegisterRead,
  RegisterRequest,
  RegisterWrite,
  registrationTaxonomy,
  RequestedSeats,
  SeatCap,
  SessionId,
  WorkshopPolicy,
} from '@endgame/registration'
import { Contract, ObservationWindow, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { it } from '@systemfsoftware/vitest'
import { Effect, Layer } from 'effect'

const policy = WorkshopPolicy.make({ cap: SeatCap.make(4), holdTtl: HoldTtl.make(15 * 60 * 1000) })

const registerOnce = Stimulus.make({
  name: 'registration.register',
  run: ({ input }: { readonly input: RegisterRequest }) =>
    Effect.flatMap(
      memoryStore([{ sessionId: 'monday', capacity: 2 }]),
      (store) => store((unit) => registerCell(policy)(unit).run(input)),
    ),
})

const decidedAs = (decision: 'Seated' | 'SessionUnknown') =>
  Contract.of(registrationTaxonomy).pipe(
    Contract.stimulate(registerOnce),
    Contract.holds(Rel.all(
      Rel.exists(Register),
      Rel.exists(RegisterRead),
      Rel.exists(RegisterWrite),
      Rel.child(Register, RegisterRead),
      Rel.child(Register, RegisterWrite),
      Rel.attrs(Register, { 'app.registration.register.decision': decision }),
    )),
  )

const harness = Layer.mergeAll(ObservationWindow.make('endgame-registration').layer, NodeFileSystem.layer)

Suite.make({ it })('registration span graph')
  .withScenarioLayer(harness)
  .live('the failure dump writes the decoded graph through the real Node file system')
  .body(({ Case }) => {
    Case(
      'a register that holds a seat carries the Seated decision on its span',
      decidedAs('Seated'),
      RegisterRequest.make({
        sessionId: SessionId.make('monday'),
        person: PersonId.make('ada'),
        requested: RequestedSeats.make(1),
      }),
    )
    Case(
      'a register for an unknown session carries the SessionUnknown decision on its span',
      decidedAs('SessionUnknown'),
      RegisterRequest.make({
        sessionId: SessionId.make('sunday'),
        person: PersonId.make('ada'),
        requested: RequestedSeats.make(1),
      }),
    )
  })
