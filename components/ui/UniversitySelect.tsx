"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const AFRICAN_UNIVERSITIES = [
  "Addis Ababa University",
  "African Leadership University",
  "Ahmadu Bello University",
  "Ain Shams University",
  "Assiut University",
  "Babcock University",
  "Cairo University",
  "Cheikh Anta Diop University",
  "Covenant University",
  "Delta State University",
  "Durban University of Technology",
  "Egerton University",
  "Federal University of Technology Akure",
  "Joseph Ayo Babalola University",
  "Kenyatta University",
  "Kwame Nkrumah University of Science and Technology",
  "Lagos State University",
  "Makerere University",
  "Mohammed V University",
  "Moi University",
  "National University of Rwanda",
  "Nelson Mandela University",
  "Nnamdi Azikiwe University",
  "North-West University",
  "Obafemi Awolowo University",
  "Pan-African University",
  "Rhodes University",
  "Rivers State University",
  "Stellenbosch University",
  "Strathmore University",
  "Tshwane University of Technology",
  "USIU Africa",
  "University of Abuja",
  "University of Algiers",
  "University of Alexandria",
  "University of Benin",
  "University of Botswana",
  "University of Cape Town",
  "University of Dar es Salaam",
  "University of Ghana",
  "University of Ibadan",
  "University of Johannesburg",
  "University of KwaZulu-Natal",
  "University of Khartoum",
  "University of Lagos",
  "University of Limpopo",
  "University of Mauritius",
  "University of Nairobi",
  "University of Nigeria Nsukka",
  "University of Port Harcourt",
  "University of Pretoria",
  "University of Tunis",
  "University of Western Cape",
  "University of Witwatersrand",
  "University of Zambia",
  "University of Zimbabwe",
  "University of the Free State",
  "Other",
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function UniversitySelect({ value, onChange, className = "" }: Props) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = AFRICAN_UNIVERSITIES.filter((u) =>
    u.toLowerCase().includes(inputValue.toLowerCase())
  ).slice(0, 8);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

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
    setOpen(true);
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
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Search university..."
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto"
        >
          {filtered.map((item, i) => (
            <li
              key={item}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => selectItem(item)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-700 hover:bg-gray-50"
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
