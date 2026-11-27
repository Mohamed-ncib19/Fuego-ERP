import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { InputGroup } from "@astryxdesign/core/InputGroup";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";

/**
 * Astryx password field with a show/hide toggle attached to the input.
 * The error message sits under the group; the input itself gets the red
 * border.
 */
export function PasswordField({
  label,
  value,
  onChange,
  error,
  description,
  placeholder,
  autoComplete = "off",
  isRequired,
  hasAutoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  description?: string;
  placeholder?: string;
  autoComplete?: string;
  isRequired?: boolean;
  hasAutoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <InputGroup
      label={label}
      description={description}
      isRequired={isRequired}
      status={error ? { type: "error", message: error } : undefined}
      className="flex w-full"
    >
      <TextInput
        label={label}
        isLabelHidden
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        hasAutoFocus={hasAutoFocus}
        status={error ? { type: "error" } : undefined}
      />
      <Button
        label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        isIconOnly
        variant="secondary"
        icon={<Icon icon={shown ? EyeOff : Eye} size="sm" />}
        onClick={() => setShown((v) => !v)}
      />
    </InputGroup>
  );
}
