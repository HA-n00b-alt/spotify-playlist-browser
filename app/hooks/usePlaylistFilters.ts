'use client'

import { useEffect, useMemo, useReducer } from 'react'
import type { SpotifyTrack, SortField, SortDirection } from '@/lib/types'

type Track = SpotifyTrack

type FiltersState = {
  pageSize: number | 'all'
  currentPage: number
  searchQuery: string
  sortField: SortField | null
  sortDirection: SortDirection
  showAdvanced: boolean
  yearFrom: string
  yearTo: string
  bpmFrom: string
  bpmTo: string
  includeHalfDoubleBpm: boolean
}

type SetAction<State, K extends keyof State = keyof State> = {
  type: 'set'
  key: K
  value: State[K] | ((prev: State[K]) => State[K])
}

const filtersReducer = (state: FiltersState, action: SetAction<FiltersState>): FiltersState => {
  if (action.type !== 'set') return state
  const nextValue = typeof action.value === 'function'
    ? (action.value as (prev: FiltersState[typeof action.key]) => FiltersState[typeof action.key])(state[action.key])
    : action.value
  return {
    ...state,
    [action.key]: nextValue,
  }
}

const createInitialFiltersState = (): FiltersState => ({
  pageSize: 50,
  currentPage: 1,
  searchQuery: '',
  sortField: null,
  sortDirection: 'asc',
  showAdvanced: false,
  yearFrom: '',
  yearTo: '',
  bpmFrom: '',
  bpmTo: '',
  includeHalfDoubleBpm: false,
})

const getYear = (dateString: string | null | undefined): number | null => {
  if (!dateString) return null
  const year = dateString.split('-')[0]
  const yearNum = parseInt(year, 10)
  return isNaN(yearNum) ? null : yearNum
}

export function usePlaylistFilters(tracks: Track[], trackBpms: Record<string, number | null>) {
  const [state, dispatch] = useReducer(filtersReducer, undefined, createInitialFiltersState)
  const {
    pageSize,
    currentPage,
    searchQuery,
    sortField,
    sortDirection,
    showAdvanced,
    yearFrom,
    yearTo,
    bpmFrom,
    bpmTo,
    includeHalfDoubleBpm,
  } = state

  const filteredTracks = useMemo(() => {
    return tracks.filter((track) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesText = (
          track.name.toLowerCase().includes(query) ||
          track.artists.some((artist) => artist.name.toLowerCase().includes(query)) ||
          track.album.name.toLowerCase().includes(query) ||
          track.album.release_date.includes(query) ||
          ((trackBpms[track.id] != null && Math.round(trackBpms[track.id]!).toString().includes(query)) ||
           (track.tempo && Math.round(track.tempo).toString().includes(query)))
        )
        if (!matchesText) return false
      }

      const trackYear = getYear(track.album.release_date)
      if (yearFrom || yearTo) {
        if (trackYear === null) return false
        if (yearFrom && trackYear < parseInt(yearFrom, 10)) return false
        if (yearTo && trackYear > parseInt(yearTo, 10)) return false
      }

      const trackBpm = trackBpms[track.id] != null
        ? Math.round(trackBpms[track.id]!)
        : (track.tempo ? Math.round(track.tempo) : null)
      if (bpmFrom || bpmTo) {
        if (trackBpm === null) return false

        const bpmFromNum = bpmFrom ? parseInt(bpmFrom, 10) : null
        const bpmToNum = bpmTo ? parseInt(bpmTo, 10) : null

        const matchesBpm = (!bpmFromNum || trackBpm >= bpmFromNum) && (!bpmToNum || trackBpm <= bpmToNum)
        if (matchesBpm) {
          return true
        }

        if (includeHalfDoubleBpm) {
          const halfBpm = trackBpm / 2
          const doubleBpm = trackBpm * 2
          const matchesHalf = (!bpmFromNum || halfBpm >= bpmFromNum) && (!bpmToNum || halfBpm <= bpmToNum)
          const matchesDouble = (!bpmFromNum || doubleBpm >= bpmFromNum) && (!bpmToNum || doubleBpm <= bpmToNum)
          if (matchesHalf || matchesDouble) {
            return true
          }
        }

        return false
      }

      return true
    })
  }, [tracks, searchQuery, trackBpms, yearFrom, yearTo, bpmFrom, bpmTo, includeHalfDoubleBpm])

  const sortedTracks = useMemo(() => {
    return [...filteredTracks].sort((a, b) => {
      if (!sortField) return 0

      let aValue: string | number
      let bValue: string | number

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
        case 'artists':
          aValue = a.artists.map((artist) => artist.name).join(', ').toLowerCase()
          bValue = b.artists.map((artist) => artist.name).join(', ').toLowerCase()
          break
        case 'album':
          aValue = a.album.name.toLowerCase()
          bValue = b.album.name.toLowerCase()
          break
        case 'release_date':
          aValue = a.album.release_date || ''
          bValue = b.album.release_date || ''
          break
        case 'duration':
          aValue = a.duration_ms
          bValue = b.duration_ms
          break
        case 'added_at':
          aValue = a.added_at || ''
          bValue = b.added_at || ''
          break
        case 'tempo': {
          const rawA = trackBpms[a.id]
          const rawB = trackBpms[b.id]
          const fallbackA = a.tempo ?? -1
          const fallbackB = b.tempo ?? -1
          const parsedA = typeof rawA === 'string' ? Number(rawA) : rawA
          const parsedB = typeof rawB === 'string' ? Number(rawB) : rawB
          const normalizedA =
            typeof parsedA === 'number' && !Number.isNaN(parsedA) ? parsedA : fallbackA
          const normalizedB =
            typeof parsedB === 'number' && !Number.isNaN(parsedB) ? parsedB : fallbackB
          aValue = normalizedA
          bValue = normalizedB
          break
        }
        case 'popularity':
          aValue = a.popularity ?? -1
          bValue = b.popularity ?? -1
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredTracks, sortField, sortDirection, trackBpms])

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(sortedTracks.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedTracks = pageSize === 'all'
    ? sortedTracks
    : sortedTracks.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => {
    dispatch({ type: 'set', key: 'currentPage', value: 1 })
  }, [searchQuery, sortField, sortDirection, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      dispatch({ type: 'set', key: 'currentPage', value: totalPages })
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('playlistPageSize')
    if (!saved) return
    if (saved === 'all') {
      dispatch({ type: 'set', key: 'pageSize', value: 'all' })
      return
    }
    const parsed = Number(saved)
    if (!Number.isNaN(parsed) && parsed > 0) {
      dispatch({ type: 'set', key: 'pageSize', value: parsed })
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('playlistPageSize', String(pageSize))
  }, [pageSize])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      dispatch({
        type: 'set',
        key: 'sortDirection',
        value: sortDirection === 'asc' ? 'desc' : 'asc',
      })
    } else {
      dispatch({ type: 'set', key: 'sortField', value: field })
      dispatch({ type: 'set', key: 'sortDirection', value: 'asc' })
    }
  }

  const getYearString = (dateString: string | null | undefined): string => {
    const year = getYear(dateString)
    return year ? year.toString() : 'N/A'
  }

  return {
    filteredTracks,
    sortedTracks,
    paginatedTracks,
    totalPages,
    safePage,
    searchQuery,
    sortField,
    sortDirection,
    showAdvanced,
    yearFrom,
    yearTo,
    bpmFrom,
    bpmTo,
    includeHalfDoubleBpm,
    pageSize,
    currentPage,
    setSearchQuery: (value: string) => dispatch({ type: 'set', key: 'searchQuery', value }),
    setSortField: (value: SortField | null) => dispatch({ type: 'set', key: 'sortField', value }),
    setSortDirection: (value: SortDirection) => dispatch({ type: 'set', key: 'sortDirection', value }),
    setShowAdvanced: (value: boolean | ((prev: boolean) => boolean)) => dispatch({ type: 'set', key: 'showAdvanced', value }),
    setYearFrom: (value: string) => dispatch({ type: 'set', key: 'yearFrom', value }),
    setYearTo: (value: string) => dispatch({ type: 'set', key: 'yearTo', value }),
    setBpmFrom: (value: string) => dispatch({ type: 'set', key: 'bpmFrom', value }),
    setBpmTo: (value: string) => dispatch({ type: 'set', key: 'bpmTo', value }),
    setIncludeHalfDoubleBpm: (value: boolean) => dispatch({ type: 'set', key: 'includeHalfDoubleBpm', value }),
    setPageSize: (value: number | 'all') => dispatch({ type: 'set', key: 'pageSize', value }),
    setCurrentPage: (value: number | ((prev: number) => number)) => dispatch({ type: 'set', key: 'currentPage', value }),
    handleSort,
    getYearString,
  }
}
