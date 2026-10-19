import React, { useState } from 'react';
import toast from 'react-hot-toast';

const challenges = [
  {
    question: "What chemical compound is essential for photosynthesis in plant leaves?",
    options: ["Carbon Dioxide & Water", "Nitrogen & Methane", "Glucose & Oxygen", "Hydrogen Peroxide"],
    answer: 0,
    explanation: "Plants use Carbon Dioxide (CO2) and Water (H2O) along with light to produce Glucose and Oxygen!"
  },
  {
    question: "In Mathematics, what is the derivative of xÂ² with respect to x?",
    options: ["x", "2x", "xÂ³ / 3", "2"],
    answer: 1,
    explanation: "Using the power rule: d/dx (x^n) = n * x^(n-1), so d/dx (xÂ²) = 2x."
  },
  {
    question: "Which organelle is known as the powerhouse of the eukaryotic cell?",
    options: ["Ribosome", "Nucleus", "Mitochondria", "Golgi Body"],
    answer: 2,
    explanation: "Mitochondria generate most of the chemical energy (ATP) needed to power the cell."
  }
];

export default function AIStudyBuddyWidget() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [streak, setStreak] = useState(0);
  const [points, setPoints] = useState(0);

  const current = challenges[currentIndex];

  const handleSelect = (index) => {
    if (selectedOption !== null) return; // already answered
    setSelectedOption(index);

    if (index === current.answer) {
      const newStreak = streak + 1;
      const newPoints = points + 25;
      setStreak(newStreak);
      setPoints(newPoints);
      toast.success(`Correct! +25 Session Points! Streak: ${newStreak}ðŸ”¥`, { duration: 3000 });
    } else {
      setStreak(0);
      toast.error("Not quite! Check the explanation below.", { duration: 3000 });
    }
  };

  const handleNext = () => {
    setSelectedOption(null);
    setCurrentIndex((prev) => (prev + 1) % challenges.length);
  };

  return (
    <div className="study-buddy-card glass-card">
      <div className="buddy-header">
        <div className="buddy-title-group">
          <span className="buddy-badge">âš¡ AI DAILY CHALLENGE</span>
          <h4>Quick Concept Booster</h4>
        </div>
        <div className="buddy-stats">
          <span className="streak-tag">{streak} Session Streak</span>
          <span className="points-tag">â­ {points} Session Points</span>
        </div>
      </div>

      <p className="buddy-question">{current.question}</p>

      <div className="buddy-options">
        {current.options.map((opt, i) => {
          let btnClass = "buddy-opt-btn";
          if (selectedOption !== null) {
            if (i === current.answer) btnClass += " correct";
            else if (i === selectedOption) btnClass += " wrong";
          }
          return (
            <button
              key={i}
              className={btnClass}
              onClick={() => handleSelect(i)}
              disabled={selectedOption !== null}
            >
              <span className="opt-index">{String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          );
        })}
      </div>

      {selectedOption !== null && (
        <div className="buddy-explanation page-transition">
          <p><strong>Explanation:</strong> {current.explanation}</p>
          <button className="next-challenge-btn" onClick={handleNext}>
            Next Question âž”
          </button>
        </div>
      )}

      <style>{`
        .study-buddy-card {
          background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%);
          border-radius: 16px;
          padding: 20px;
          color: #f8fafc;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
          margin-bottom: 24px;
        }

        .buddy-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .buddy-badge {
          font-size: 0.68rem;
          font-weight: 800;
          color: #a855f7;
          background: rgba(168, 85, 247, 0.15);
          padding: 3px 8px;
          border-radius: 12px;
          letter-spacing: 0.05em;
          display: inline-block;
          margin-bottom: 4px;
        }

        .buddy-title-group h4 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 700;
        }

        .buddy-stats {
          display: flex;
          gap: 8px;
        }

        .streak-tag {
          background: rgba(249, 115, 22, 0.2);
          color: #fb923c;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 12px;
        }

        .points-tag {
          background: rgba(234, 179, 8, 0.2);
          color: #facc15;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 12px;
        }

        .buddy-question {
          font-size: 0.95rem;
          font-weight: 600;
          color: #e2e8f0;
          margin-bottom: 14px;
          line-height: 1.45;
        }

        .buddy-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 14px;
        }

        .buddy-opt-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: rgba(51, 65, 85, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #f1f5f9;
          font-size: 0.82rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .buddy-opt-btn:hover:not(:disabled) {
          background: #2563eb;
          border-color: #3b82f6;
        }

        .opt-index {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          display: grid;
          place-items: center;
          font-size: 0.7rem;
          font-weight: 800;
          flex-shrink: 0;
        }

        .buddy-opt-btn.correct {
          background: rgba(16, 185, 129, 0.25);
          border-color: #10b981;
          color: #34d399;
        }

        .buddy-opt-btn.wrong {
          background: rgba(239, 68, 68, 0.25);
          border-color: #ef4444;
          color: #f87171;
        }

        .buddy-explanation {
          background: rgba(15, 23, 42, 0.8);
          padding: 12px 16px;
          border-radius: 10px;
          border-left: 3px solid #3b82f6;
          font-size: 0.82rem;
          color: #cbd5e1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .next-challenge-btn {
          background: #2563eb;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
        }

        @media (max-width: 600px) {
          .buddy-options {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
