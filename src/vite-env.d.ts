/// <reference types="vite/client" />

declare module "*.c?raw" {
  const content: string;
  export default content;
}

declare module "*.fam?raw" {
  const content: string;
  export default content;
}
