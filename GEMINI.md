# Gemini Codebase Analysis

## Project Overview

This project, `fintoolkit`, is a full-stack application designed for financial data analysis. It appears to be a monorepo containing a web application and a backend server. The primary goal of the application is to screen and analyze financial data from various sources, with a specific focus on "Dataroma", a site that tracks the portfolios of well-known investors.

**Key Technologies:**

*   **Frontend:** React, TypeScript, Vite
*   **Backend:** Node.js, TypeScript, ts-node
*   **Styling:** Likely plain CSS or a library imported within the React components.
*   **Linting:** ESLint with TypeScript support.

**Architecture:**

The project is structured as a monorepo with the following key components:

*   `apps/web`: A React-based single-page application (SPA) that serves as the user interface. It communicates with the backend server to fetch data and display it to the user.
*   `server`: A Node.js server written in TypeScript that provides an API for the frontend. It appears to have a specific focus on a "Dataroma Screener" feature.
*   `src`: A directory containing the core business logic, providers for external services (like `eodhd`), and other services. This code is likely shared between the web app and the server.
*   `scripts`: Contains Node.js scripts for development and other tasks.

## Building and Running

*   **Development:**
    *   `npm run dev`: Starts the development server for both the frontend and backend.
    *   `npm run dev:vite`: Starts the Vite development server for the frontend only.
*   **Building:**
    *   `npm run build`: Builds the frontend application for production.
*   **Previewing the Build:**
    *   `npm run preview`: Previews the production build of the frontend.
*   **Type Checking:**
    *   `npm run typecheck`: Runs the TypeScript compiler to check for type errors in the entire project.
*   **Dataroma Screener Server:**
    *   `npm run dataroma-screener:server`: Starts the Dataroma Screener backend server using `ts-node`.

## Development Conventions

*   **TypeScript:** The project heavily uses TypeScript for both frontend and backend development, indicating a preference for static typing.
*   **ESLint:** An ESLint configuration is present, suggesting a standardized coding style is enforced.
*   **Testing:** No testing framework is explicitly defined in the `package.json`'s main dependencies. However, the presence of a `fixtures` directory suggests that some form of testing (likely integration or end-to-end) is being performed.
*   **Modular Architecture:** The codebase is organized into distinct modules with clear responsibilities, such as `providers`, `services`, and `domain`. This promotes separation of concerns and maintainability.
