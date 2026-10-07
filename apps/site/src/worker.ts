import startHandler from '@tanstack/react-start/server-entry'

export default {
  fetch: (request: Request): Promise<Response> => Promise.resolve(startHandler.fetch(request)),
}
