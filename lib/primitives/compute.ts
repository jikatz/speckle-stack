import { SpeckleStackProps } from "../props";
import { SpeckleStack } from "../speckle-stack";
import { getServerService } from "./services/server";
import { getWebService } from "./services/web";

export const getServices = (stack: SpeckleStack, props: SpeckleStackProps) => {

    getWebService(stack, props.web)
    getServerService(stack, props.server)
    
}