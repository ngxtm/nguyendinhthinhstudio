/**
 * Admin Dashboard
 * Overview và quick stats
 */

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Total Albums"
          value="0"
          description="Published albums"
          color="blue"
        />
        <StatCard
          title="Total Images"
          value="0"
          description="Uploaded images"
          color="green"
        />
        <StatCard
          title="Total Views"
          value="0"
          description="Album views"
          color="purple"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="space-y-3">
          <a
            href="/admin/albums/new"
            className="block px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
          >
            ➕ Tạo Album Mới
          </a>
          <a
            href="/admin/albums"
            className="block px-6 py-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-center font-medium"
          >
            📚 Quản Lý Albums
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  color,
}: {
  title: string;
  value: string;
  description: string;
  color: 'blue' | 'green' | 'purple';
}) {
  const bgColors = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    purple: 'bg-purple-50',
  };

  const textColors = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
  };

  return (
    <div className={`${bgColors[color]} rounded-lg p-6`}>
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <p className={`text-3xl font-bold ${textColors[color]} mb-1`}>{value}</p>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

