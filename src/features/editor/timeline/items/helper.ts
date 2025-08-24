import { Helper as HelperBase, type HelperProps } from "@designcombo/timeline";

class Helper extends HelperBase {
  static type = "Helper";

  constructor(props: HelperProps) {
    props.activeGuideFill = "#ffffff";
    super(props);
  }
}

export default Helper;
