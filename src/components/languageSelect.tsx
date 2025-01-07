// src/components/LanguageSelect.tsx

import React from "react";
import Select, {
    components,
    OptionProps,
    SingleValueProps,
    StylesConfig,
} from "react-select";
import ReactCountryFlag from "react-country-flag";

// Define the shape of your language options
export interface LanguageOption {
    value: string;
    label: string;
    countryCode: string;
}

// Props for the LanguageSelect component
interface LanguageSelectProps {
    options: LanguageOption[];
    value: LanguageOption | null;
    onChange: (selectedOption: LanguageOption | null) => void;
    placeholder?: string;
}

// Custom styles for react-select to align with Tailwind CSS
const customStyles: StylesConfig<LanguageOption, false> = {
    control: (provided) => ({
        ...provided,
        backgroundColor: "#f3f4f6", // Tailwind's bg-gray-100
        borderColor: "#d1d5db", // Tailwind's border-gray-300
        borderRadius: "0.375rem", // Tailwind's rounded-md
        padding: "0.5rem",
    }),
    option: (provided, state) => ({
        ...provided,
        backgroundColor: state.isFocused ? "#e5e7eb" : "#ffffff", // Tailwind's bg-gray-200 on focus
        color: "#1f2937", // Tailwind's text-gray-800
        display: "flex",
        alignItems: "center",
    }),
    singleValue: (provided) => ({
        ...provided,
        display: "flex",
        alignItems: "center",
    }),
};

// Custom Option component to include flags
const CustomOption = (props: OptionProps<LanguageOption, false>) => {
    return (
        <components.Option {...props}>
            <ReactCountryFlag
                countryCode={props.data.countryCode}
                svg
                style={{
                    width: "1.5em",
                    height: "1.5em",
                    marginRight: "0.5em",
                }}
                title={props.data.countryCode}
            />
            {props.label}
        </components.Option>
    );
};

// Custom SingleValue component to include flags
const CustomSingleValue = (
    props: SingleValueProps<LanguageOption, false>
) => {
    return (
        <components.SingleValue {...props}>
            <ReactCountryFlag
                countryCode={props.data.countryCode}
                svg
                style={{
                    width: "1.5em",
                    height: "1.5em",
                    marginRight: "0.5em",
                }}
                title={props.data.countryCode}
            />
            {props.data.label}
        </components.SingleValue>
    );
};

export const LanguageSelect: React.FC<LanguageSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = "Select language...",
}) => {
    return (
        <Select
            styles={customStyles}
            components={{ Option: CustomOption, SingleValue: CustomSingleValue }}
            options={options}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            isSearchable
        />
    );
};
