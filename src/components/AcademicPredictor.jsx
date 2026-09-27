import React, { useState } from 'react';
import toast from 'react-hot-toast';

export default function AcademicPredictor() {
  const [studyHours, setStudyHours] = useState(8);
  const [attendance, setAttendance] = useState(90);
  const [quizMastery, setQuizMastery] = useState(75);
  const [subject, setSubject] = useState('Mathematics');

  // Compute predicted score based on weighting formula:
  // Base 30% + (Study Hours * 2.5) + (Attendance * 0.35) + (Quiz Mastery * 0.25)
  const calculatePrediction = () => {
    let rawScore = 20 + (studyHours * 2.8) + (attendance * 0.3) + (quizMastery * 0.3);
    const score = Math.min(100, Math.round(rawScore));

    let grade = 'F';
    let color = '#ef4444';
    if (score >= 90) { grade = 'A+'; color = '#10b981'; }
    else if (score >= 80) { grade = 'A'; color = '#3b82f6'; }
    else if (score >= 70) { grade = 'B'; color = '#8b5cf6'; }
    else if (score >= 60) { grade = 'C'; color = '#f59e0b'; }
    else if (score >= 50) { grade = 'D'; color = '#f97316'; }

    return { score, grade, color };
  };

  const prediction = calculatePrediction();

  const getTip = () => {
    if (studyHours < 6) return "💡 Tip: Increasing study time to 10 hrs/week could boost your score by up to 12%!";
    if (attendance < 85) return "⚠️ Warning: Low attendance directly impacts retention. Aim for >90% attendance!";
    if (quizMastery < 70) return "🎯 Focus Area: Try taking 2 practice quizzes on the Quiz Portal to improve mastery!";
    return "🌟 Excellent pace! Maintain current study habits to secure an honors grade.";
  };

  const saveGoal = () => {
    toast.success(`🎯 Goal Saved: Target ${prediction.score}% (${prediction.grade}) in ${subject}!`, {
      duration: 4000
    });
  };

  return (
    <div className="academic-predictor-card glass-card">
      <div className="predictor-header">
        <div className="predictor-title-group">
          <span className="ai-badge">AI FORECAST</span>
          <h3>Grade & Performance Predictor</h3>
        </div>
        <select
          value={subject}
          onChange={e => setSubject(e.target.value)}
          className="subject-select"
        >
          <option value="Mathematics">Mathematics</option>
          <option value="Sciences">Sciences</option>
          <option value="English Literature">English Literature</option>
          <option value="Computer Science">Computer Science</option>
        </select>
      </div>

      <div className="predictor-grid">
        {/* Sliders Area */}
        <div className="sliders-container">
          <div className="slider-group">
            <div className="slider-label">
              <span>Weekly Study Hours</span>
              <b>{studyHours} hrs/wk</b>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              value={studyHours}
              onChange={e => setStudyHours(Number(e.target.value))}
            />
          </div>

          <div className="slider-group">
            <div className="slider-label">
              <span>Attendance Rate</span>
              <b>{attendance}%</b>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              value={attendance}
              onChange={e => setAttendance(Number(e.target.value))}
            />
          </div>

          <div className="slider-group">
            <div className="slider-label">
              <span>Quiz Practice Mastery</span>
              <b>{quizMastery}%</b>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={quizMastery}
              onChange={e => setQuizMastery(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Prediction Meter */}
        <div className="prediction-display">
          <div className="score-circle" style={{ borderColor: prediction.color }}>
            <span className="predicted-score" style={{ color: prediction.color }}>
              {prediction.score}%
            </span>
            <span className="predicted-grade" style={{ backgroundColor: prediction.color }}>
              Grade {prediction.grade}
            </span>
          </div>
          <p className="ai-tip">{getTip()}</p>
          <button className="save-goal-btn" onClick={saveGoal}>
            🎯 Set Target Goal
          </button>
        </div>
      </div>

      <style>{`
        .academic-predictor-card {
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%);
          border-radius: 16px;
          padding: 20px;
          color: #f8fafc;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
          margin-bottom: 24px;
        }

        .predictor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .ai-badge {
          font-size: 0.68rem;
          font-weight: 800;
          color: #3b82f6;
          background: rgba(59, 130, 246, 0.15);
          padding: 3px 8px;
          border-radius: 12px;
          letter-spacing: 0.05em;
          display: inline-block;
          margin-bottom: 4px;
        }

        .predictor-title-group h3 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
        }

        .subject-select {
          background: #1e293b;
          color: #f8fafc;
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.85rem;
          outline: none;
        }

        .predictor-grid {
          display: grid;
          grid-template-columns: 1fr 220px;
          gap: 24px;
          align-items: center;
        }

        .sliders-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .slider-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .slider-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.82rem;
          color: #94a3b8;
        }

        .slider-label b {
          color: #60a5fa;
        }

        input[type="range"] {
          width: 100%;
          accent-color: #2563eb;
          cursor: pointer;
        }

        .prediction-display {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          background: rgba(15, 23, 42, 0.6);
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .score-circle {
          width: 90px;
          height: 90px;
          border-radius: 50%;
          border: 4px solid #3b82f6;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          position: relative;
          background: rgba(30, 41, 59, 0.5);
        }

        .predicted-score {
          font-size: 1.5rem;
          font-weight: 800;
          line-height: 1;
        }

        .predicted-grade {
          position: absolute;
          bottom: -8px;
          font-size: 0.65rem;
          font-weight: 800;
          color: #ffffff;
          padding: 2px 8px;
          border-radius: 10px;
          white-space: nowrap;
        }

        .ai-tip {
          font-size: 0.75rem;
          color: #cbd5e1;
          margin-bottom: 12px;
          line-height: 1.35;
        }

        .save-goal-btn {
          width: 100%;
          padding: 8px 12px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
        }

        .save-goal-btn:hover {
          background: #1d4ed8;
        }

        @media (max-width: 768px) {
          .predictor-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
