"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  country?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const DEBOUNCE_MS = 300;

export default function UniversitySelect({
  value,
  onChange,
  country,
  disabled = false,
  placeholder,
  className = "",
}: Props) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    setResults([]);
    setSearched(false);
  }, [country]);

  useEffect(() => {
    if (!country || disabled) {
      setResults([]);
      return;
    }

    let isActive = true;
    setLoading(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ country });
        const term = inputValue.trim();
        if (term) params.set("q", term);

        const response = await fetch(`/api/universities?${params.toString()}`);
        if (!isActive) return;

        if (!response.ok) {
          setResults([]);
          return;
        }

        const data = (await response.json()) as { universities?: string[] };
        if (!isActive) return;
        setResults(data.universities ?? []);
      } catch {
        if (isActive) setResults([]);
      } finally {
        if (isActive) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [country, disabled, inputValue]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Only offer manual entry once a search has actually come back empty —
  // not while a country is still loading its first batch of results.
  const showManualOption = !loading && searched && results.length === 0;
  const optionCount = results.length + (showManualOption ? 1 : 0);

  const selectItem = useCallback(
    (item: string) => {
      setInputValue(item);
      onChange(item);
      setOpen(false);
      setActiveIndex(-1);
    },
    [onChange]
  );

  const confirmManualEntry = useCallback(() => {
    onChange(inputValue.trim());
    setOpen(false);
    setActiveIndex(-1);
  }, [inputValue, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setOpen(!disabled);
    setActiveIndex(-1);
  };

  const handleBlur = () => {
    // Keep typed value even if not in list
    setTimeout(() => {
      if (inputValue.trim() !== value) onChange(inputValue.trim());
      setOpen(false);
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (!open && e.key !== "Escape") {
      setOpen(true);
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, optionCount - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          selectItem(results[activeIndex]);
        } else if (showManualOption) {
          confirmManualEntry();
        }
        break;
      case "Escape":
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setOpen(!disabled)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? (country ? "Search university..." : "Select country first")}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open && (optionCount > 0 || loading) ? listId : undefined}
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      />
      {open && !disabled && (loading || optionCount > 0) && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-400">Searching...</li>
          ) : (
            <>
              {results.map((item, i) => (
                <li
                  key={item}
                  id={`${listId}-option-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={() => selectItem(item)}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    i === activeIndex
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-gray-700 hover:bg-canvas"
                  }`}
                >
                  {item}
                </li>
              ))}
              {showManualOption ? (
                <li
                  id={`${listId}-option-${results.length}`}
                  role="option"
                  aria-selected={activeIndex === results.length}
                  onMouseDown={confirmManualEntry}
                  className={`cursor-pointer border-t border-gray-100 px-3 py-2 text-sm font-medium transition-colors ${
                    activeIndex === results.length
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-emerald-700 hover:bg-canvas"
                  }`}
                >
                  Can&apos;t find your university? Add it manually.
                </li>
              ) : null}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
