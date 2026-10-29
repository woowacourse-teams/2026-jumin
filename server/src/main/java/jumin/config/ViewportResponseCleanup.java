package jumin.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jumin.domain.parking.viewport.ViewportBody;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class ViewportResponseCleanup implements WebMvcConfigurer {

    public static final String BODY_ATTRIBUTE = ViewportResponseCleanup.class.getName() + ".body";
    private static final String WRITTEN_ATTRIBUTE = ViewportResponseCleanup.class.getName() + ".written";

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler,
                                   ModelAndView modelAndView) {
                if (request.getAttribute(BODY_ATTRIBUTE) instanceof ViewportBody) {
                    request.setAttribute(WRITTEN_ATTRIBUTE, true);
                }
            }

            @Override
            public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                        Object handler, Exception exception) {
                if (request.getAttribute(BODY_ATTRIBUTE) instanceof ViewportBody body) {
                    body.complete(Boolean.TRUE.equals(request.getAttribute(WRITTEN_ATTRIBUTE))
                            && exception == null && response.getStatus() < 400);
                }
            }
        }).addPathPatterns("/api/parking/viewport");
    }
}
