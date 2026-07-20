import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import type { ReactNode } from "react";

export default function RootHtml({ children }: { children: ReactNode }) {
  const { bodyAttributes, bodyNodes, headNodes, htmlAttributes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="light dark" />
        <meta media="(prefers-color-scheme: light)" name="theme-color" content="#F2F2F7" />
        <meta media="(prefers-color-scheme: dark)" name="theme-color" content="#000000" />
        <ScrollViewStyleReset />
        {headNodes}
        <style
          dangerouslySetInnerHTML={{
            __html: "html,body,#root{min-height:100%;background:#F2F2F7}body{margin:0}@media(prefers-color-scheme:dark){html,body,#root{background:#000}}",
          }}
        />
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
