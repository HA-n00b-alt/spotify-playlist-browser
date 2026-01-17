'use client'

interface SkeletonLoaderProps {
  className?: string
  variant?: 'text' | 'card' | 'table-row' | 'image'
  width?: string
  height?: string
}

export function SkeletonLoader({ 
  className = '', 
  variant = 'text',
  width,
  height 
}: SkeletonLoaderProps) {
  const baseClasses = 'animate-pulse bg-gray-200 rounded'
  
  const variantClasses = {
    text: 'h-4',
    card: 'h-32',
    'table-row': 'h-12',
    image: 'aspect-square',
  }
  
  const style: React.CSSProperties = {}
  if (width) style.width = width
  if (height) style.height = height
  
  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  )
}

export function TrackListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200">
          <SkeletonLoader variant="image" width="48px" height="48px" />
          <div className="flex-1 space-y-2">
            <SkeletonLoader variant="text" width="60%" />
            <SkeletonLoader variant="text" width="40%" />
          </div>
          <SkeletonLoader variant="text" width="80px" />
        </div>
      ))}
    </div>
  )
}

export function TrackTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left"><SkeletonLoader variant="text" width="100px" /></th>
            <th className="px-4 py-3 text-left"><SkeletonLoader variant="text" width="150px" /></th>
            <th className="px-4 py-3 text-left"><SkeletonLoader variant="text" width="120px" /></th>
            <th className="px-4 py-3 text-left"><SkeletonLoader variant="text" width="100px" /></th>
            <th className="px-4 py-3 text-left"><SkeletonLoader variant="text" width="80px" /></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {Array.from({ length: 10 }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3"><SkeletonLoader variant="image" width="40px" height="40px" /></td>
              <td className="px-4 py-3"><SkeletonLoader variant="text" width="200px" /></td>
              <td className="px-4 py-3"><SkeletonLoader variant="text" width="150px" /></td>
              <td className="px-4 py-3"><SkeletonLoader variant="text" width="100px" /></td>
              <td className="px-4 py-3"><SkeletonLoader variant="text" width="60px" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}













