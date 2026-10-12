import React, { useState, useEffect, useRef } from 'react';
import { MapPin, X, ChevronDown, Check } from 'lucide-react';
import type { PlacePrediction } from '../types/pipsqueak.ts';

interface LocationAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onSelectSuggestion?: (val: string) => void;
  onSelectPrediction?: (pred: PlacePrediction) => void;
  placeholder?: string;
  className?: string;
  showProviderStatus?: boolean;
}

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  onSelectSuggestion,
  onSelectPrediction,
  placeholder = 'City, ZIP, or neighborhood...',
  className = '',
  showProviderStatus = true,
}) => {
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [providerSource, setProviderSource] = useState<string>('built_in_dictionary');
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.predictions || []);
          if (data.source) setProviderSource(data.source);
          setProviderConfigured(!!data.providerConfigured);
          setIsOpen((data.predictions || []).length > 0);
        }
      } catch (e) {
        console.warn('Location suggestions unavailable, manual entry active', e);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [value]);

  const handleSelect = (item: PlacePrediction) => {
    onChange(item.text);
    if (onSelectSuggestion) onSelectSuggestion(item.text);
    if (onSelectPrediction) onSelectPrediction(item);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <MapPin className="absolute left-3 w-4 h-4 text-neutral-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          aria-label="Location search"
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-colors"
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 p-0.5 text-neutral-400 hover:text-neutral-700 transition-colors"
            aria-label="Clear location filter"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {showProviderStatus && (
            <div className="px-3 py-1.5 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Suggested locations</span>
              <span className="font-mono text-[10px]">
                {providerConfigured ? 'Google Places API (Live)' : 'Provider unconfigured (Manual entry fallback)'}
              </span>
            </div>
          )}
          <ul className="py-1">
            {suggestions.map((item, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-50 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span className="font-medium text-neutral-800 truncate">{item.text}</span>
                  </div>
                  <span className="text-[11px] text-neutral-400 shrink-0 ml-2">{item.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
