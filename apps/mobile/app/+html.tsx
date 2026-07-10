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
        <meta name="theme-color" content="#F6F4EE" />
        <ScrollViewStyleReset />
        {headNodes}
        <style
          dangerouslySetInnerHTML={{
            __html: "html,body,#root{min-height:100%;background:#F6F4EE}body{margin:0}",
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
