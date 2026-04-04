export function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-gray-200 rounded h-4 animate-pulse opacity-60 ${className}`} />
  );
}

export function SkeletonTable() {
  return (
    <div className="bg-gray-100 rounded-lg shadow overflow-x-auto border border-gray-200" data-testid="skeleton-table">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-20" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-16" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-16" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-24" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-12" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-16" />
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b">
              <td className="px-6 py-3">
                <SkeletonLine className="w-40" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-20" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-20" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-24" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-12" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-16" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonReports() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" data-testid="skeleton-table">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-gray-100 rounded-lg border border-gray-200 p-6 animate-pulse aspect-square flex flex-col justify-between opacity-60">
          <div className="flex-1">
            <SkeletonLine className="w-2/3 mb-3" />
            <SkeletonLine className="w-1/2 mb-2" />
            <SkeletonLine className="w-2/5" />
          </div>
          <div className="flex gap-2 justify-end">
            <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
            <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
            <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonAuditTable({ isAdmin = false }: { isAdmin?: boolean }) {
  void isAdmin; // used for future column count customization
  
  return (
    <div className="bg-gray-100 rounded-lg border border-gray-200 overflow-x-auto" data-testid="skeleton-table">
      <table className="w-full">
        <thead className="bg-gray-200 border-b border-gray-300">
          <tr>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-32" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-24" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-20" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-16" />
            </th>
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-28" />
            </th>
            {isAdmin && (
              <>
                <th className="px-6 py-3 text-left">
                  <SkeletonLine className="w-16" />
                </th>
                <th className="px-6 py-3 text-left">
                  <SkeletonLine className="w-20" />
                </th>
                <th className="px-6 py-3 text-left">
                  <SkeletonLine className="w-24" />
                </th>
                <th className="px-6 py-3 text-left">
                  <SkeletonLine className="w-32" />
                </th>
              </>
            )}
            <th className="px-6 py-3 text-left">
              <SkeletonLine className="w-12" />
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b">
              <td className="px-6 py-3">
                <SkeletonLine className="w-32" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-24" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-20" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-16" />
              </td>
              <td className="px-6 py-3">
                <SkeletonLine className="w-28" />
              </td>
              {isAdmin && (
                <>
                  <td className="px-6 py-3">
                    <SkeletonLine className="w-16" />
                  </td>
                  <td className="px-6 py-3">
                    <SkeletonLine className="w-20" />
                  </td>
                  <td className="px-6 py-3">
                    <SkeletonLine className="w-24" />
                  </td>
                  <td className="px-6 py-3">
                    <SkeletonLine className="w-32" />
                  </td>
                </>
              )}
              <td className="px-6 py-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
