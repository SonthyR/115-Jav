import { createFileRoute, notFound } from '@tanstack/react-router'

import { WatchMoviePage } from '@/features/watch/movie-page'

export const Route = createFileRoute('/_watch/movie/$id')({
  beforeLoad: ({ params }) => {
    if (!/^[1-9]\d*$/.test(params.id)) throw notFound()
  },
  component: MovieRoute
})

function MovieRoute() {
  const { id } = Route.useParams()
  return <WatchMoviePage key={id} id={Number(id)} />
}
