import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const CarouselBanner = ({ userRole }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      id: 1,
      title: "Master Your Skills",
      subtitle: "Practice with real placement questions",
      bgColor: "from-indigo-600 to-purple-600",
      icon: "🎯"
    },
    {
      id: 2,
      title: "Ace Your Interviews",
      subtitle: "Build confidence with mock tests",
      bgColor: "from-blue-600 to-cyan-600",
      icon: "🚀"
    },
    {
      id: 3,
      title: "Track Your Progress",
      subtitle: "Monitor your improvement over time",
      bgColor: "from-green-600 to-emerald-600",
      icon: "📈"
    },
    {
      id: 4,
      title: "Stay Ahead",
      subtitle: "Access curated resources and past papers",
      bgColor: "from-purple-600 to-pink-600",
      icon: "⭐"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [slides.length]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
  };

  const currentSlideData = slides[currentSlide];

  return (
    <div className="relative w-full h-48 sm:h-56 rounded-2xl overflow-hidden text-white mb-6 border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      {/* Classic gradient base */}
      <div className={`absolute inset-0 bg-gradient-to-r ${currentSlideData.bgColor} transition-all duration-700`} />
      {/* Radial glow overlay */}
      <div className="absolute -left-10 -top-10 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -right-10 -bottom-16 w-80 h-80 rounded-full bg-black/20 blur-3xl" />

      {/* Content */}
      <div className="relative h-full px-6 sm:px-10 flex items-center">
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-2 bg-black/25 backdrop-blur px-3 py-1 rounded-full text-xs tracking-wide mb-2 border border-white/10">
            <span className="opacity-90">{currentSlideData.subtitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/15 flex items-center justify-center text-2xl shadow-inner">
              <span>{currentSlideData.icon}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
              {currentSlideData.title}
            </h2>
          </div>
          <div className="mt-3 hidden sm:block text-sm text-white/90 max-w-2xl">
            Elevate your preparation with curated resources, timed quizzes, and progress insights.
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end gap-3">
          <Link
            to="/prep"
            className="inline-flex items-center gap-2 bg-white text-gray-900 px-5 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl hover:translate-y-[-1px] active:translate-y-0 transition-all"
          >
            Go to Placement Preparation
            <span className="text-gray-700">→</span>
          </Link>
          {/* Slide indicators */}
          <div className="flex space-x-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  index === currentSlide ? 'bg-white w-5' : 'bg-white/50 w-2.5'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile CTA and indicators */}
      <div className="sm:hidden absolute bottom-3 left-4 right-4 flex items-center justify-between">
        <div className="flex space-x-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                index === currentSlide ? 'bg-white w-5' : 'bg-white/50 w-2.5'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
        <Link
          to="/prep"
          className="inline-flex items-center gap-1.5 bg-white/95 text-gray-900 px-3 py-2 rounded-md font-semibold shadow-md"
        >
          Open
          <span>→</span>
        </Link>
      </div>

      {/* Prev/Next controls */}
      <button
        onClick={() => setCurrentSlide((currentSlide - 1 + slides.length) % slides.length)}
        className="absolute left-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-black/25 hover:bg-black/35 border border-white/10"
        aria-label="Previous slide"
      >
        ‹
      </button>
      <button
        onClick={() => setCurrentSlide((currentSlide + 1) % slides.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-black/25 hover:bg-black/35 border border-white/10"
        aria-label="Next slide"
      >
        ›
      </button>
    </div>
  );
};

export default CarouselBanner;
