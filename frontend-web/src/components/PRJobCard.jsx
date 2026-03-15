import React, { useState } from 'react';

const PRJobCard = ({ job, onManageRounds }) => {
  const [showRounds, setShowRounds] = useState(false);
  
  const getCurrentRound = () => {
    if (!job.selectionRounds?.length) return null;
    return job.selectionRounds.find(round => round.status === 'in-progress') || 
           job.selectionRounds.find(round => round.status === 'pending');
  };
  
  const getCompletedRounds = () => {
    return job.selectionRounds?.filter(round => round.status === 'completed').length || 0;
  };
  
  const currentRound = getCurrentRound();
  const completedRounds = getCompletedRounds();
  const totalRounds = job.selectionRounds?.length || 0;

  return (
    <div className="bg-white rounded-lg shadow-md border hover:shadow-lg transition-shadow">
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{job.companyName}</h3>
            <p className="text-gray-600">{job.role}</p>
          </div>
          <div className="text-right">
            <span className="text-sm text-gray-500">Applications</span>
            <p className="text-xl font-bold text-blue-600">{job.applications?.length || 0}</p>
          </div>
        </div>

        {/* Selection Progress */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Selection Progress</span>
            <span className="text-sm text-gray-500">{completedRounds}/{totalRounds} rounds</span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${totalRounds > 0 ? (completedRounds / totalRounds) * 100 : 0}%` }}
            ></div>
          </div>
          
          {currentRound && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-blue-900">{currentRound.name}</p>
                  <p className="text-sm text-blue-700">
                    {currentRound.status === 'in-progress' ? 'In Progress' : 'Upcoming'}
                  </p>
                </div>
                <div className="text-right text-sm text-blue-600">
                  {currentRound.date && (
                    <div className="flex items-center gap-1">
                      📅 {new Date(currentRound.date).toLocaleDateString()}
                    </div>
                  )}
                  {currentRound.time && (
                    <div className="flex items-center gap-1">
                      🕐 {currentRound.time}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rounds Toggle */}
        <div className="mb-4">
          <button
            onClick={() => setShowRounds(!showRounds)}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            {showRounds ? '▼' : '▶'} View All Rounds ({totalRounds})
          </button>
          
          {showRounds && (
            <div className="mt-3 space-y-2">
              {job.selectionRounds?.map((round, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded-lg border ${
                    round.status === 'completed' ? 'bg-green-50 border-green-200' :
                    round.status === 'in-progress' ? 'bg-blue-50 border-blue-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-sm">{round.name}</p>
                      <p className="text-xs text-gray-600 capitalize">{round.status}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {round.status === 'completed' && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          {round.selectedStudents?.length || 0} selected
                        </span>
                      )}
                      {round.status === 'in-progress' && (
                        <button
                          onClick={() => onManageRounds(job, index)}
                          className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
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
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onManageRounds(job)}
            className="flex-1 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            👥 Manage Selection
          </button>
        </div>
      </div>
    </div>
  );
};

export default PRJobCard;