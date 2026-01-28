#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";

// ============================================================================
// Types & Constants
// ============================================================================

interface BootstrapOptions {
  name: string;
  description: string;
  packageManager: PackageManager;
  interactive: boolean;
}

const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm"] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const DEFAULTS: BootstrapOptions = {
  name: "topheman/vite-react-ts-template",
  description: "A starter template for frontend projects.",
  packageManager: "npm",
  interactive: true,
};

const ENV_VARS = {
  TITLE: "VITE_TITLE",
  DESCRIPTION: "VITE_DESCRIPTION",
} as const;

const RESOURCES_SECTION = `## Resources

This project is based on the [topheman/vite-react-ts-template](https://github.com/topheman/vite-react-ts-template) template.
`;

// ============================================================================
// Argument Parsing
// ============================================================================

interface FlagParseResult {
  value: string;
  nextIndex: number;
}

/**
 * Collects multi-word argument value until the next flag is encountered
 */
function collectFlagValue(args: string[], startIndex: number): FlagParseResult {
  const parts: string[] = [];
  let i = startIndex;
  while (i < args.length && !args[i].startsWith("--")) {
    parts.push(args[i++]);
  }
  return {
    value: parts.join(" "),
    nextIndex: i - 1, // Adjust because the loop will increment
  };
}

/**
 * Validates and returns a valid package manager, or exits with error
 */
function validatePackageManager(pm: string): PackageManager {
  if (PACKAGE_MANAGERS.includes(pm as PackageManager)) {
    return pm as PackageManager;
  }
  console.error(
    `Invalid package manager: ${pm}. Must be one of: ${PACKAGE_MANAGERS.join(", ")}`,
  );
  process.exit(1);
}

/**
 * Parses command-line arguments into BootstrapOptions
 */
function parseArgs(): Partial<BootstrapOptions> {
  const args = process.argv.slice(2);
  const options: Partial<BootstrapOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--name") {
      const result = collectFlagValue(args, i + 1);
      if (result.value) {
        options.name = result.value;
      }
      i = result.nextIndex;
    } else if (arg === "--description") {
      const result = collectFlagValue(args, i + 1);
      if (result.value) {
        options.description = result.value;
      }
      i = result.nextIndex;
    } else if (arg === "--packageManager" && args[i + 1]) {
      options.packageManager = validatePackageManager(args[++i]);
    } else if (arg === "--interactive") {
      if (args[i + 1] === "false" || args[i + 1] === "0") {
        options.interactive = false;
        i++;
      } else {
        options.interactive = true;
      }
    } else if (arg === "--no-interactive") {
      options.interactive = false;
    }
  }

  return options;
}

// ============================================================================
// Interactive Prompts
// ============================================================================

type ReadlineInterface = ReturnType<typeof createInterface>;

/**
 * Creates a readline interface for user input
 */
function createReadlineInterface(): ReadlineInterface {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompts the user for input and returns a promise
 */
function promptUser(rli: ReadlineInterface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rli.question(query, resolve);
  });
}

/**
 * Merges command-line arguments with current package.json values and defaults
 */
function mergeOptions(
  cliArgs: Partial<BootstrapOptions>,
  packageJsonValues: { name: string; description: string },
): BootstrapOptions {
  return {
    name: cliArgs.name || packageJsonValues.name || DEFAULTS.name,
    description:
      cliArgs.description ||
      packageJsonValues.description ||
      DEFAULTS.description,
    packageManager: cliArgs.packageManager || DEFAULTS.packageManager,
    interactive:
      cliArgs.interactive !== undefined
        ? cliArgs.interactive
        : DEFAULTS.interactive,
  };
}

/**
 * Checks if interactive mode should be skipped based on CLI flags
 */
function shouldSkipInteractive(cliArgs: Partial<BootstrapOptions>): boolean {
  return (
    cliArgs.interactive === false ||
    process.argv.includes("--no-interactive") ||
    process.argv.includes("--interactive=false")
  );
}

/**
 * Prompts user for each option in interactive mode
 */
async function promptForUserInput(
  rli: ReadlineInterface,
  options: BootstrapOptions,
): Promise<BootstrapOptions> {
  console.log("\n📦 Bootstrap Configuration\n");

  // Prompt for name
  const nameAnswer = await promptUser(rli, `Project name [${options.name}]: `);
  if (nameAnswer.trim()) {
    options.name = nameAnswer.trim();
  }

  // Prompt for description
  const descAnswer = await promptUser(
    rli,
    `Project description [${options.description}]: `,
  );
  if (descAnswer.trim()) {
    options.description = descAnswer.trim();
  }

  // Prompt for package manager
  console.log(`\nPackage manager options: ${PACKAGE_MANAGERS.join(", ")}`);
  const pmAnswer = await promptUser(
    rli,
    `Package manager [${options.packageManager}]: `,
  );
  const trimmedPm = pmAnswer.trim();
  if (trimmedPm && PACKAGE_MANAGERS.includes(trimmedPm as PackageManager)) {
    options.packageManager = trimmedPm as PackageManager;
  } else if (trimmedPm) {
    console.warn(
      `Invalid package manager "${trimmedPm}", using ${options.packageManager}`,
    );
  }

  return options;
}

/**
 * Collects all options from CLI args, package.json, and user prompts
 */
async function collectOptions(
  rli: ReadlineInterface,
  cliArgs: Partial<BootstrapOptions>,
): Promise<BootstrapOptions> {
  const packageJsonValues = getCurrentPackageJsonValues();
  let options = mergeOptions(cliArgs, packageJsonValues);

  if (!shouldSkipInteractive(cliArgs) && options.interactive) {
    options = await promptForUserInput(rli, options);
  }

  return options;
}

// ============================================================================
// Package.json Operations
// ============================================================================

/**
 * Extracts value from npm pkg output (removes JSON quotes)
 */
function extractNpmPkgValue(output: string): string {
  return output.trim().replace(/^"|"$/g, "");
}

/**
 * Gets current name and description from package.json
 */
function getCurrentPackageJsonValues(): { name: string; description: string } {
  try {
    const name = extractNpmPkgValue(
      execSync("npm pkg get name", { encoding: "utf-8" }),
    );
    const description = extractNpmPkgValue(
      execSync("npm pkg get description", { encoding: "utf-8" }),
    );
    return { name, description };
  } catch (error) {
    console.error("Error reading package.json:", error);
    return { name: DEFAULTS.name, description: DEFAULTS.description };
  }
}

/**
 * Updates package.json name and description using npm pkg
 */
function updatePackageJson(name: string, description: string): void {
  try {
    execSync(`npm pkg set name="${name}"`, { stdio: "inherit" });
    execSync(`npm pkg set description="${description}"`, { stdio: "inherit" });
  } catch (error) {
    console.error("Error updating package.json:", error);
    throw error;
  }
}

// ============================================================================
// .env File Operations
// ============================================================================

/**
 * Parses a single line from .env file into key-value pair
 */
function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const [key, ...valueParts] = trimmed.split("=");
  if (!key) {
    return null;
  }

  return {
    key: key.trim(),
    value: valueParts.join("=").trim(),
  };
}

/**
 * Reads and parses .env file into a key-value object
 */
function readEnvFile(): Record<string, string> {
  const envPath = join(process.cwd(), ".env");
  const env: Record<string, string> = {};

  if (!existsSync(envPath)) {
    return env;
  }

  try {
    const content = readFileSync(envPath, "utf-8");
    content.split("\n").forEach((line) => {
      const parsed = parseEnvLine(line);
      if (parsed) {
        env[parsed.key] = parsed.value;
      }
    });
  } catch (error) {
    console.warn("Warning: Could not read .env file:", error);
  }

  return env;
}

/**
 * Checks if a line contains an environment variable assignment
 */
function isEnvVarLine(line: string, key: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith(`${key}=`);
}

/**
 * Updates an existing environment variable in place, or marks it as not found
 */
function updateEnvVarInPlace(
  lines: string[],
  key: string,
  value: string,
): boolean {
  for (let i = 0; i < lines.length; i++) {
    if (isEnvVarLine(lines[i], key)) {
      lines[i] = `${key}=${value || ""}`;
      return true; // Found and updated
    }
  }
  return false; // Not found
}

/**
 * Removes trailing empty lines from the lines array
 */
function removeTrailingEmptyLines(lines: string[]): void {
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
}

/**
 * Adds environment variables that weren't found in the file
 */
function addMissingEnvVars(
  lines: string[],
  varsToAdd: Array<{ key: string; value: string }>,
): void {
  if (varsToAdd.length === 0) {
    return;
  }

  // Remove trailing empty lines before adding new vars
  removeTrailingEmptyLines(lines);

  // Add a blank line before new vars if file has content
  if (lines.length > 0) {
    lines.push("");
  }

  // Add all missing variables
  varsToAdd.forEach(({ key, value }) => {
    lines.push(`${key}=${value || ""}`);
  });
}

/**
 * Writes updated environment variables to .env file
 * Preserves comments and structure while updating or adding variables
 */
function writeEnvFile(env: Record<string, string>): void {
  const envPath = join(process.cwd(), ".env");

  // Read existing file or start with empty content
  const originalContent = existsSync(envPath)
    ? readFileSync(envPath, "utf-8")
    : "";
  const lines = originalContent.split("\n");

  // Track which variables we need to add (not found in file)
  const varsToAdd: Array<{ key: string; value: string }> = [];

  // Update VITE_TITLE if it exists, otherwise mark for addition
  const titleValue = env[ENV_VARS.TITLE] || "";
  if (!updateEnvVarInPlace(lines, ENV_VARS.TITLE, titleValue)) {
    varsToAdd.push({ key: ENV_VARS.TITLE, value: titleValue });
  }

  // Update VITE_DESCRIPTION if it exists, otherwise mark for addition
  const descValue = env[ENV_VARS.DESCRIPTION] || "";
  if (!updateEnvVarInPlace(lines, ENV_VARS.DESCRIPTION, descValue)) {
    varsToAdd.push({ key: ENV_VARS.DESCRIPTION, value: descValue });
  }

  // Add any missing variables at the end
  addMissingEnvVars(lines, varsToAdd);

  // Write file with proper newline at end
  const content = lines.join("\n");
  const finalContent =
    content + (content && !content.endsWith("\n") ? "\n" : "");
  writeFileSync(envPath, finalContent, "utf-8");
}

// ============================================================================
// File Update Operations
// ============================================================================

/**
 * Updates the title in README.md (first line)
 */
function updateReadmeTitle(content: string, name: string): string {
  const lines = content.split("\n");
  if (lines[0].startsWith("#")) {
    lines[0] = `# ${name}`;
  } else {
    lines[0] = `# ${name}\n${lines[0]}`;
  }
  return lines.join("\n");
}

/**
 * Appends Resources section to README.md if not already present
 */
function appendResourcesSection(content: string): string {
  if (content.includes("## Resources")) {
    return content;
  }

  // Ensure there's a newline before adding the section
  const separator = content.endsWith("\n") ? "\n" : "\n\n";
  return content + separator + RESOURCES_SECTION;
}

/**
 * Updates README.md with new title and Resources section
 */
function updateReadme(name: string): void {
  const readmePath = join(process.cwd(), "README.md");
  let content = readFileSync(readmePath, "utf-8");

  content = updateReadmeTitle(content, name);
  content = appendResourcesSection(content);

  writeFileSync(readmePath, content, "utf-8");
}

/**
 * Gets the install command for a package manager in worktrees
 */
function getWorktreeInstallCommand(packageManager: PackageManager): string {
  const commands: Record<PackageManager, string> = {
    npm: "npm install",
    pnpm: "pnpm install",
    yarn: "yarn",
  };
  return commands[packageManager];
}

/**
 * Updates .cursor/worktrees.json with the correct package manager command
 */
function updateWorktreesJson(packageManager: PackageManager): void {
  const worktreesPath = join(process.cwd(), ".cursor", "worktrees.json");
  const worktrees = {
    "setup-worktree": [getWorktreeInstallCommand(packageManager)],
  };

  writeFileSync(
    worktreesPath,
    JSON.stringify(worktrees, null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Gets the install command for a package manager in GitHub Actions
 */
function getGithubActionsInstallCommand(
  packageManager: PackageManager,
): string {
  const commands: Record<PackageManager, string> = {
    npm: "npm ci",
    pnpm: "pnpm install",
    yarn: "yarn install --frozen-lockfile",
  };
  return commands[packageManager];
}

/**
 * Updates the Install dependencies step in .github/workflows/deploy.yml
 */
function updateDeployYml(packageManager: PackageManager): void {
  const deployPath = join(process.cwd(), ".github", "workflows", "deploy.yml");
  let content = readFileSync(deployPath, "utf-8");
  const installCommand = getGithubActionsInstallCommand(packageManager);

  // Try regex replacement first
  const installPattern = /(\s+- name: Install dependencies\s+run: )(.+)/;
  if (installPattern.test(content)) {
    content = content.replace(installPattern, `$1${installCommand}`);
  } else {
    // Fallback: manual line-by-line replacement
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes("Install dependencies") &&
        i + 1 < lines.length &&
        lines[i + 1].includes("run:")
      ) {
        lines[i + 1] = lines[i + 1].replace(
          /run: .+/,
          `run: ${installCommand}`,
        );
        break;
      }
    }
    content = lines.join("\n");
  }

  writeFileSync(deployPath, content, "utf-8");
}

// ============================================================================
// Summary & Confirmation
// ============================================================================

/**
 * Displays a summary of all changes that will be applied
 */
function showSummary(
  options: BootstrapOptions,
  currentPackageJson: { name: string; description: string },
): void {
  console.log("\n📋 Summary of changes:\n");
  console.log(`  • package.json:`);
  console.log(`    - name: "${currentPackageJson.name}" → "${options.name}"`);
  console.log(
    `    - description: "${currentPackageJson.description}" → "${options.description}"`,
  );
  console.log(`  • README.md:`);
  console.log(`    - title: "${currentPackageJson.name}" → "${options.name}"`);
  console.log(`    - Resources section will be added (if not present)`);
  console.log(`  • .env:`);
  console.log(`    - ${ENV_VARS.TITLE}: "${options.name}"`);
  console.log(`    - ${ENV_VARS.DESCRIPTION}: "${options.description}"`);
  console.log(`  • .cursor/worktrees.json:`);
  console.log(
    `    - setup-worktree: "${getWorktreeInstallCommand(options.packageManager)}"`,
  );
  console.log(`  • .github/workflows/deploy.yml:`);
  console.log(
    `    - Install dependencies: "${getGithubActionsInstallCommand(options.packageManager)}"`,
  );
}

/**
 * Prompts user for confirmation before applying changes
 */
async function confirmChanges(rli: ReadlineInterface): Promise<boolean> {
  const answer = await promptUser(rli, "\n❓ Apply these changes? (Y/n): ");
  const normalized = answer.toLowerCase().trim();
  return normalized !== "n" && normalized !== "no";
}

// ============================================================================
// Main Application Flow
// ============================================================================

/**
 * Applies all bootstrap changes to the project files
 */
function applyBootstrapChanges(options: BootstrapOptions): void {
  console.log("\n🚀 Applying changes...\n");

  // Update package.json
  console.log("  ✓ Updating package.json...");
  updatePackageJson(options.name, options.description);

  // Update README.md
  console.log("  ✓ Updating README.md...");
  updateReadme(options.name);

  // Update .env
  console.log("  ✓ Updating .env...");
  const env = readEnvFile();
  env[ENV_VARS.TITLE] = options.name;
  env[ENV_VARS.DESCRIPTION] = options.description;
  writeEnvFile(env);

  // Update .cursor/worktrees.json
  console.log("  ✓ Updating .cursor/worktrees.json...");
  updateWorktreesJson(options.packageManager);

  // Update .github/workflows/deploy.yml
  console.log("  ✓ Updating .github/workflows/deploy.yml...");
  updateDeployYml(options.packageManager);

  console.log("\n✅ Bootstrap complete!\n");
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  const cliArgs = parseArgs();
  const rli = createReadlineInterface();

  try {
    const currentPackageJson = getCurrentPackageJsonValues();
    const options = await collectOptions(rli, cliArgs);

    // Show summary and confirm in interactive mode
    if (options.interactive) {
      showSummary(options, currentPackageJson);
      const confirmed = await confirmChanges(rli);
      if (!confirmed) {
        console.log("\n❌ Cancelled.");
        return;
      }
    }

    // Apply all changes
    applyBootstrapChanges(options);
  } catch (error) {
    console.error("\n❌ Error during bootstrap:", error);
    process.exit(1);
  } finally {
    rli.close();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
