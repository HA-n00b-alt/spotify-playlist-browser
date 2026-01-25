'use client'

import type { RefObject } from 'react'

type PageSize = number | 'all'

type FilterControlsProps = {
  searchQuery: string
  showAdvanced: boolean
  yearFrom: string
  yearTo: string
  bpmFrom: string
  bpmTo: string
  includeHalfDoubleBpm: boolean
  pageSize: PageSize
  safePage: number
  totalPages: number
  searchInputRef: RefObject<HTMLInputElement>
  onSearchQueryChange: (value: string) => void
  onToggleAdvanced: () => void
  onYearFromChange: (value: string) => void
  onYearToChange: (value: string) => void
  onBpmFromChange: (value: string) => void
  onBpmToChange: (value: string) => void
  onIncludeHalfDoubleBpmChange: (value: boolean) => void
  onClearFilters: () => void
  onPageSizeChange: (value: PageSize) => void
  onPrevPage: () => void
  onNextPage: () => void
}

export default function FilterControls({
  searchQuery,
  showAdvanced,
  yearFrom,
  yearTo,
  bpmFrom,
  bpmTo,
  includeHalfDoubleBpm,
  pageSize,
  safePage,
  totalPages,
  searchInputRef,
  onSearchQueryChange,
  onToggleAdvanced,
  onYearFromChange,
  onYearToChange,
  onBpmFromChange,
  onBpmToChange,
  onIncludeHalfDoubleBpmChange,
  onClearFilters,
  onPageSizeChange,
  onPrevPage,
  onNextPage,
}: FilterControlsProps) {
  return (
    <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search tracks... (Cmd/Ctrl+F)"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          ref={searchInputRef}
          className="w-full bg-transparent py-3 pl-10 pr-11 text-sm text-gray-900 placeholder-gray-500 border-b border-gray-300 focus:outline-none focus:border-gray-500"
        />
        <button
          type="button"
          onClick={onToggleAdvanced}
          className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 ${
            showAdvanced ? 'bg-gray-100 text-gray-700' : 'bg-white'
          }`}
          title={showAdvanced ? 'Hide advanced search' : 'Show advanced search'}
          aria-label={showAdvanced ? 'Hide advanced filters' : 'Show advanced filters'}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h10M4 6h2M10 12h10M4 12h2M10 18h10M4 18h2" />
          </svg>
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-3 sm:mt-4 p-5 sm:p-6 bg-gray-100 rounded-lg border border-gray-200">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-4xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Year Range
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="number"
                  placeholder="From"
                  value={yearFrom}
                  onChange={(e) => onYearFromChange(e.target.value)}
                  className="w-24 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <span className="text-gray-500 dark:text-slate-400 text-sm whitespace-nowrap">to</span>
                <input
                  type="number"
                  placeholder="To"
                  value={yearTo}
                  onChange={(e) => onYearToChange(e.target.value)}
                  className="w-24 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                BPM Range
              </label>
              <div className="flex gap-3 items-center mb-3">
                <input
                  type="number"
                  placeholder="From"
                  value={bpmFrom}
                  onChange={(e) => onBpmFromChange(e.target.value)}
                  className="w-24 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <span className="text-gray-500 dark:text-slate-400 text-sm whitespace-nowrap">to</span>
                <input
                  type="number"
                  placeholder="To"
                  value={bpmTo}
                  onChange={(e) => onBpmToChange(e.target.value)}
                  className="w-24 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeHalfDoubleBpm}
                  onChange={(e) => onIncludeHalfDoubleBpmChange(e.target.checked)}
                  className="mr-2 w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">
                  Include tracks with half/double BPM
                </span>
              </label>
            </div>
          </div>
          
          {(yearFrom || yearTo || bpmFrom || bpmTo) && (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-4 text-sm text-red-600 hover:text-red-700 underline"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs sm:text-sm text-gray-600">Per page</label>
        <select
          value={pageSize}
          onChange={(e) => {
            const value = e.target.value
            onPageSizeChange(value === 'all' ? 'all' : Number(value))
          }}
          className="px-2 py-1 border border-gray-300 rounded text-gray-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="all">All</option>
        </select>
        {pageSize !== 'all' && (
          <div
            className={`flex items-center gap-2 ml-auto text-xs sm:text-sm text-gray-600 ${
              totalPages <= 1 ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <button
              onClick={onPrevPage}
              disabled={safePage <= 1}
              className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 dark:text-slate-500 disabled:border-gray-200"
            >
              Prev
            </button>
            <span>
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={onNextPage}
              disabled={safePage >= totalPages}
              className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 dark:text-slate-500 disabled:border-gray-200"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
