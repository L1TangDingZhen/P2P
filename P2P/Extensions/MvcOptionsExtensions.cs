using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationModels;
using Microsoft.AspNetCore.Mvc.Routing;
using System;

namespace P2P.Extensions
{
    public static class MvcOptionsExtensions
    {
        public static void UseCentralRoutePrefix(this MvcOptions opts, IRouteTemplateProvider routeAttribute)
        {
            // 创建一个路由前缀约定
            opts.Conventions.Add(new RoutePrefixConvention(routeAttribute));
        }
    }

    public class RoutePrefixConvention : IApplicationModelConvention
    {
        private readonly AttributeRouteModel _routePrefix;

        public RoutePrefixConvention(IRouteTemplateProvider route)
        {
            _routePrefix = new AttributeRouteModel(route);
        }

        public void Apply(ApplicationModel application)
        {
            // 遍历所有控制器
            foreach (var controller in application.Controllers)
            {
                // 找到所有带路由特性的actions
                var matchedSelectors = controller.Selectors
                    .Where(x => x.AttributeRouteModel != null).ToList();
                
                if (matchedSelectors.Any())
                {
                    // 修改每个action的路由
                    foreach (var selectorModel in matchedSelectors)
                    {
                        // 合并路由前缀和action的路由
                        selectorModel.AttributeRouteModel = AttributeRouteModel.CombineAttributeRouteModel(
                            _routePrefix,
                            selectorModel.AttributeRouteModel);
                    }
                }

                // 处理没有路由特性的actions
                var unmatchedSelectors = controller.Selectors
                    .Where(x => x.AttributeRouteModel == null).ToList();
                
                if (unmatchedSelectors.Any())
                {
                    // 为没有路由的action添加默认路由
                    foreach (var selectorModel in unmatchedSelectors)
                    {
                        selectorModel.AttributeRouteModel = _routePrefix;
                    }
                }
            }
        }
    }
}