"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { getUniversitiesForCountry } from "@/lib/academicIdentity";
import { createClient } from "@/lib/supabase/client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  country?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [directoryUniversities, setDirectoryUniversities] = useState<string[]>([]);
  const fallbackUniversities = getUniversitiesForCountry(country);

  const fallbackFiltered = fallbackUniversities.filter((u) =>
    u.toLowerCase().includes(inputValue.toLowerCase())
  ).slice(0, 8);
  const filtered = directoryUniversities.length > 0
    ? directoryUniversities
    : fallbackFiltered;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!country || disabled) {
      setDirectoryUniversities([]);
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      const supabase = createClient();
      const searchTerm = inputValue.trim();
      let query = supabase
        .from("universities")
        .select("name")
        .eq("country", country)
        .order("name", { ascending: true })
        .limit(12);

      if (searchTerm) {
        query = query.ilike("name", `%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (!isActive) return;

      if (error) {
        setDirectoryUniversities([]);
        return;
      }

      setDirectoryUniversities(
        ((data ?? []) as Array<{ name: string | null }>)
          .map((item) => item.name)
          .filter((name): name is string => Boolean(name))
      );
    }, 150);

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

  const selectItem = useCallback(
    (item: string) => {
      setInputValue(item);
      onChange(item);
      setOpen(false);
      setActiveIndex(-1);
    },
    [onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setOpen(!disabled);
    setActiveIndex(-1);
  };

  const handleBlur = () => {
    // Keep typed value even if not in list
    setTimeout(() => {
      if (inputValue !== value) onChange(inputValue);
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
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && filtered[activeIndex]) {
          selectItem(filtered[activeIndex]);
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
        aria-controls={open && filtered.length > 0 ? listId : undefined}
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      />
      {open && !disabled && filtered.length > 0 && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto"
        >
          {filtered.map((item, i) => (
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
        </ul>
      )}
    </div>
  );
}
