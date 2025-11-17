import { useMemo } from 'react';

/**
 * Simple markdown renderer for changelog display
 * Supports: headers, paragraphs, lists, horizontal rules, bold text
 */
function MarkdownRenderer({ content, isDarkMode }) {
  const renderedContent = useMemo(() => {
    if (!content) return null;
    
    const lines = content.split('\n');
    const elements = [];
    let inList = false;
    let listItems = [];
    
    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className={`list-disc list-inside mb-4 space-y-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {listItems.map((item, idx) => (
              <li key={idx} className="text-sm">{item}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
      inList = false;
    };
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // Empty line
      if (!trimmed) {
        flushList();
        return;
      }
      
      // Horizontal rule
      if (trimmed.startsWith('---')) {
        flushList();
        elements.push(
          <hr key={`hr-${index}`} className={`my-4 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`} />
        );
        return;
      }
      
      // Headers
      if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={`h3-${index}`} className={`text-lg font-bold mb-2 mt-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            {trimmed.substring(4)}
          </h3>
        );
        return;
      }
      
      if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={`h2-${index}`} className={`text-xl font-bold mb-3 mt-6 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            {trimmed.substring(3)}
          </h2>
        );
        return;
      }
      
      if (trimmed.startsWith('# ')) {
        flushList();
        elements.push(
          <h1 key={`h1-${index}`} className={`text-2xl font-bold mb-4 mt-6 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            {trimmed.substring(2)}
          </h1>
        );
        return;
      }
      
      // List items
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        inList = true;
        let itemText = trimmed.substring(2);
        // Handle bold text
        itemText = itemText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        listItems.push(<span dangerouslySetInnerHTML={{ __html: itemText }} />);
        return;
      }
      
      // Regular paragraph
      flushList();
      let paraText = trimmed;
      // Handle bold text
      paraText = paraText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      elements.push(
        <p key={`p-${index}`} className={`text-sm mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          <span dangerouslySetInnerHTML={{ __html: paraText }} />
        </p>
      );
    });
    
    flushList(); // Flush any remaining list items
    
    return elements;
  }, [content, isDarkMode]);
  
  return (
    <div className="h-full overflow-y-auto">
      <div className={`p-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
        <style>{`
          .markdown-content strong {
            font-weight: 600;
            ${isDarkMode ? 'color: rgb(243 244 246);' : 'color: rgb(17 24 39);'}
          }
        `}</style>
        <div className="markdown-content">
          {renderedContent}
        </div>
      </div>
    </div>
  );
}

export default MarkdownRenderer;

