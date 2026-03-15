// Add this check at the top of the component
const isViewOnly = jobDrive?.viewOnly ?? false; // Use nullish coalescing for clarity
const canManage = jobDrive?.canManage ?? false; // Use nullish coalescing for clarity

// In the render section, update the action buttons
<div className="flex justify-between items-center mb-6">
  <h1 className="text-3xl font-bold text-gray-900">{jobDrive.companyName}</h1>
  <div className="flex space-x-3">
    {canManage ? (
      // Full management access
      <>
        <button
          onClick={() => navigate(`/pr/edit-job/${jobDrive._id}`)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Edit Drive
        </button>
        <button
          onClick={() => setShowManageModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
        >
          Manage Rounds
        </button>
      </>
    ) : isViewOnly && (user?.role === 'placement_representative' || user?.role === 'pr') ? (
      // View-only for other department PRs
      <div className="text-sm text-gray-600 bg-gray-100 px-3 py-2 rounded">
        View Only - Different Department
      </div>
    ) : user?.role === 'student' ? (
      // Student actions
      <button
        onClick={() => handleApply()}
        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
        disabled={hasApplied}
      >
        {hasApplied ? 'Applied' : 'Apply Now'}
      </button>
    ) : null}
  </div>
</div>

// Update selection rounds section to show view-only buttons
{jobDrive.selectionRounds && jobDrive.selectionRounds.length > 0 && (
  <div className="bg-white rounded-lg shadow p-6 mb-6">
    <h2 className="text-xl font-semibold mb-4">Selection Rounds</h2>
    {jobDrive.selectionRounds.map((round, index) => (
      <div key={index} className="border-b pb-4 mb-4 last:border-b-0">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-medium">{index + 1}. {round.name}</h3>
            {round.status && (
              <span className={`inline-block px-2 py-1 rounded text-xs mt-1 ${
                round.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                {round.status}
              </span>
            )}
            {round.date && (
              <p className="text-sm text-gray-600 mt-1">
                {new Date(round.date).toLocaleDateString()} at {round.time || '10:00'}
              </p>
            )}
            <p className="text-sm text-gray-600">
              Selected: {round.selectedStudents?.length || 0}
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => viewRoundDetails(round, index)}
              className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-sm font-medium"
            >
              View
            </button>
            {canManage && (
              <button
                onClick={() => manageRound(round, index)}
                className="px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded text-sm font-medium"
              >
                Manage
              </button>
            )}
          </div>
        </div>
      </div>
    ))}
  </div>
)}