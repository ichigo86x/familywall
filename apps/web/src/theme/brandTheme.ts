import { BrandVariants, createLightTheme } from "@fluentui/react-components";

const brandRamp: BrandVariants = {
  10: "#071712",
  20: "#0F2C23",
  30: "#174235",
  40: "#1F5947",
  50: "#286F58",
  60: "#3A7D6E",
  70: "#4B8E7E",
  80: "#5E9E8F",
  90: "#74AEA1",
  100: "#89BEB2",
  110: "#9FCFC3",
  120: "#B6DED3",
  130: "#CEEAE2",
  140: "#E0F2EC",
  150: "#ECF7F3",
  160: "#F5FBF8"
};

export const appTheme = createLightTheme(brandRamp);

appTheme.colorNeutralBackground1 = "#F5F3EF";
appTheme.colorNeutralBackground2 = "#FFFFFF";
appTheme.colorNeutralBackground3 = "#FCFBF8";
appTheme.colorNeutralForeground1 = "#1F2937";
appTheme.colorNeutralForeground2 = "#6B7280";
appTheme.colorNeutralStroke1 = "#D8D6CD";
appTheme.colorBrandBackground = "#3A7D6E";
appTheme.colorBrandForeground1 = "#3A7D6E";
appTheme.colorCompoundBrandStroke = "#3A7D6E";
appTheme.colorPaletteYellowBackground3 = "#FFF2DD";
appTheme.fontFamilyBase = "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
appTheme.fontFamilyMonospace = "'Cascadia Code', 'SFMono-Regular', Consolas, monospace";